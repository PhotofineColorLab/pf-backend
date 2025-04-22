const Order = require('../models/orderModel');
const { 
  getFileDownloadUrl, 
  deleteLocalFile, 
  uploadToDrive, 
  downloadFromDrive, 
  deleteFromDrive,
  getDriveClient
} = require('../config/drive');
const path = require('path');
const fs = require('fs');

// @desc    Create new order with file upload
// @route   POST /api/orders
// @access  Private
const createOrder = async (req, res) => {
  try {
    const {
      albumName,
      pageType,
      lamination,
      transparent,
      emboss,
      miniBook,
      coverType,
    } = req.body;

    if (!req.file) {
      return res.status(400).json({ message: 'Please upload a file' });
    }

    // Get the file path and information
    const filePath = req.file.path;
    const relativePath = path.basename(filePath);
    
    // Determine storage provider
    let storageProvider = 'local';
    let fileUrl = null;
    let driveFileId = null;
    let driveFileLink = null;

    // Try to upload to Google Drive if available
    try {
      // Check if Google Drive client is available
      if (getDriveClient()) {
        // Upload file to Google Drive
        const driveFile = await uploadToDrive(
          filePath,
          req.file.originalname,
          req.file.mimetype
        );

        if (driveFile) {
          // File was successfully uploaded to Google Drive
          storageProvider = 'google_drive';
          driveFileId = driveFile.id;
          driveFileLink = driveFile.webContentLink || driveFile.webViewLink;
          fileUrl = getFileDownloadUrl(req, null, driveFileId);
          
          // Delete the local file since we now have it in Google Drive
          await deleteLocalFile(filePath);
          console.log(`Local file deleted after Google Drive upload: ${filePath}`);
        }
      }
    } catch (driveError) {
      console.error('Error uploading to Google Drive, falling back to local storage:', driveError);
    }

    // If Google Drive upload failed or wasn't attempted, use local storage
    if (storageProvider === 'local') {
      fileUrl = getFileDownloadUrl(req, relativePath);
    }

    // Create order with file information
    const order = new Order({
      user: req.user._id,
      albumName,
      fileUrl,
      originalFilename: req.file.originalname,
      serverFilename: relativePath,
      fileSize: req.file.size,
      pageType,
      lamination,
      transparent: transparent === 'true',
      emboss: emboss === 'true',
      miniBook: miniBook === 'true',
      coverType,
      storageProvider,
      driveFileId,
      driveFileLink
    });

    const createdOrder = await order.save();
    res.status(201).json(createdOrder);
  } catch (error) {
    console.error('Order creation error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Get all orders for logged in user
// @route   GET /api/orders
// @access  Private
const getMyOrders = async (req, res) => {
  try {
    const orders = await Order.find({ user: req.user._id });
    res.json(orders);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Get order by ID
// @route   GET /api/orders/:id
// @access  Private
const getOrderById = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id).populate('user', 'name email');

    if (order) {
      // Check if the order belongs to the user or if the user is an admin
      if (order.user._id.toString() === req.user._id.toString() || req.user.role === 'admin') {
        res.json(order);
      } else {
        res.status(401).json({ message: 'Not authorized to view this order' });
      }
    } else {
      res.status(404).json({ message: 'Order not found' });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Get all orders (admin only)
// @route   GET /api/orders/all
// @access  Private/Admin
const getAllOrders = async (req, res) => {
  try {
    const orders = await Order.find({}).populate('user', 'name email');
    res.json(orders);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Update order status
// @route   PUT /api/orders/:id/status
// @access  Private/Admin
const updateOrderStatus = async (req, res) => {
  try {
    const { status } = req.body;

    const order = await Order.findById(req.params.id);

    if (order) {
      // Save previous status to check for transition
      const previousStatus = order.status;
      
      order.status = status;
      
      // Generate QR code if transitioning from 'GeneratingAlbum' to 'Completed'
      if (status === 'Completed' && previousStatus === 'GeneratingAlbum' && !order.qrCode) {
        // Always use the production URL for QR codes
        const baseUrl = 'https://pf-frontend-eta.vercel.app';
        order.qrCode = `${baseUrl}/album/${order._id}`;
      }

      const updatedOrder = await order.save();
      res.json(updatedOrder);
    } else {
      res.status(404).json({ message: 'Order not found' });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Download order file
// @route   GET /api/orders/:id/download
// @access  Private/Admin
const downloadOrderFile = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    // Mark as downloaded by admin
    order.downloadedByAdmin = true;
    await order.save();
    
    // Check if the user is authorized to download this file
    if (order.user.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(401).json({ message: 'Not authorized to download this file' });
    }

    // Handle different storage providers
    if (order.storageProvider === 'google_drive') {
      // For Google Drive storage
      if (!order.driveFileId) {
        return res.status(404).json({ message: 'File not found on Google Drive' });
      }

      // Stream the file from Google Drive
      try {
        await downloadFromDrive(order.driveFileId, res);
        // The response is handled by the downloadFromDrive function
      } catch (driveError) {
        console.error('Error downloading from Google Drive:', driveError);
        return res.status(500).json({ message: 'Error downloading from Google Drive', error: driveError.message });
      }
    } else if (order.storageProvider === 'local') {
      // For local storage, we need to check if the file exists
      if (!order.serverFilename) {
        return res.status(404).json({ message: 'File not found on server' });
      }

      const filePath = path.join(__dirname, '../uploads', order.serverFilename);
      
      // Check if file exists
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ message: 'File not found on server' });
      }

      // Set headers for file download
      res.setHeader('Content-Disposition', `attachment; filename="${order.originalFilename}"`);
      res.setHeader('Content-Type', 'application/octet-stream');
      
      // Create read stream and pipe to response
      const fileStream = fs.createReadStream(filePath);
      fileStream.pipe(res);
    } else if (order.publicId) {
      // For Cloudinary storage (legacy)
      // Redirect to the file URL
      res.redirect(order.fileUrl);
    } else {
      // For unknown storage providers or missing file information
      return res.status(404).json({ message: 'File not available or storage provider not supported' });
    }
  } catch (error) {
    console.error('File download error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Download file from Google Drive
// @route   GET /api/orders/drive/:fileId/download
// @access  Private/Admin
const downloadDriveFile = async (req, res) => {
  try {
    const { fileId } = req.params;
    
    // Check if user is authenticated
    if (!req.user) {
      return res.status(401).json({ message: 'Not authorized' });
    }
    
    // Find order with this drive file ID to check authorization
    const order = await Order.findOne({ driveFileId: fileId });
    
    if (!order) {
      return res.status(404).json({ message: 'Order not found for this file' });
    }
    
    // Check if the user is authorized to download this file
    if (order.user.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(401).json({ message: 'Not authorized to download this file' });
    }
    
    // Stream the file from Google Drive
    try {
      await downloadFromDrive(fileId, res);
      // The response is handled by the downloadFromDrive function
    } catch (driveError) {
      console.error('Error downloading from Google Drive:', driveError);
      return res.status(500).json({ message: 'Error downloading from Google Drive', error: driveError.message });
    }
  } catch (error) {
    console.error('Drive file download error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Add admin notes to order
// @route   PUT /api/orders/:id/notes
// @access  Private/Admin
const addOrderNotes = async (req, res) => {
  try {
    const { notes } = req.body;

    const order = await Order.findById(req.params.id);

    if (order) {
      order.adminNotes = notes;
      const updatedOrder = await order.save();
      res.json(updatedOrder);
    } else {
      res.status(404).json({ message: 'Order not found' });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Delete order and its file from storage
// @route   DELETE /api/orders/:id
// @access  Private/Admin
const deleteOrder = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);

    if (order) {
      // Delete the file from storage based on storage provider
      if (order.storageProvider === 'google_drive' && order.driveFileId) {
        try {
          // Delete from Google Drive
          await deleteFromDrive(order.driveFileId);
          console.log(`Deleted file from Google Drive: ${order.driveFileId}`);
        } catch (driveError) {
          console.error('Error deleting from Google Drive:', driveError);
          // Continue with order deletion even if file deletion fails
        }
      } else if (order.storageProvider === 'local' && order.serverFilename) {
        try {
          const filePath = path.join(__dirname, '../uploads', order.serverFilename);
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            console.log(`Deleted local file: ${filePath}`);
          }
        } catch (fileError) {
          console.error('Error deleting local file:', fileError);
          // Continue with order deletion even if file deletion fails
        }
      } else if (order.publicId) {
        // Delete from Cloudinary (for older orders)
        try {
          console.log(`Deleting file from Cloudinary: ${order.publicId}`);
          // We need to dynamically import cloudinary here since we've removed the global import
          const cloudinary = require('cloudinary').v2;
          await cloudinary.uploader.destroy(order.publicId);
        } catch (cloudinaryError) {
          console.error('Error deleting from Cloudinary:', cloudinaryError);
          // Continue with order deletion even if file deletion fails
        }
      }
      
      // Delete order from database
      await Order.deleteOne({ _id: order._id });
      
      res.json({ message: 'Order removed' });
    } else {
      res.status(404).json({ message: 'Order not found' });
    }
  } catch (error) {
    console.error('Order deletion error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};


// @desc    Get public album data by order ID
// @route   GET /api/orders/album/:id
// @access  Public
const getPublicAlbumById = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id).select('albumName status');

    if (order) {
      // Return public album data regardless of status
      res.json({
        albumName: order.albumName,
        orderId: order._id,
        status: order.status
      });
    } else {
      res.status(404).json({ message: 'Album not found' });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = {
  createOrder,
  getMyOrders,
  getOrderById,
  getAllOrders,
  updateOrderStatus,
  downloadOrderFile,
  downloadDriveFile,
  addOrderNotes,
  deleteOrder,
  getPublicAlbumById
}; 