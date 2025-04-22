const mongoose = require('mongoose');

// Define a simple schema for recording metadata about album pages
// The actual pages will be stored in a separate collection
const albumPageSchema = mongoose.Schema({
  id: {
    type: String,
    required: true,
  },
  isSelected: {
    type: Boolean,
    default: false,
  },
  position: {
    type: Number,
    required: true,
  }
});

const orderSchema = mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'User',
    },
    albumName: {
      type: String,
      required: true,
    },
    fileUrl: {
      type: String,
      required: true,
    },
    publicId: {
      type: String,
      required: false,
    },
    serverFilename: {
      type: String,
      default: null,
    },
    originalFilename: {
      type: String,
      required: true,
    },
    fileSize: {
      type: Number,
      required: true,
    },
    status: {
      type: String,
      required: true,
      enum: ['Pending', 'Acknowledged', 'Printing', 'GeneratingAlbum', 'Completed'],
      default: 'Pending',
    },
    pageType: {
      type: String,
      required: true,
      enum: ['Regular', 'NT-Slim', 'NT-Thick'],
    },
    lamination: {
      type: String,
      required: true,
      enum: ['Matte', 'Glossy', 'None'],
    },
    transparent: {
      type: Boolean,
      default: false,
    },
    emboss: {
      type: Boolean,
      default: false,
    },
    miniBook: {
      type: Boolean,
      default: false,
    },
    coverType: {
      type: String,
      required: true,
      enum: ['Leather', 'Hardcover', 'Softcover'],
    },
    qrCode: {
      type: String,
      default: null,
    },
    // Store metadata about album pages instead of full data
    albumPagesMeta: {
      type: [albumPageSchema],
      default: [],
    },
    // Total number of album pages
    albumPagesCount: {
      type: Number,
      default: 0
    },
    coverIndex: {
      type: Number,
      default: 0,
    },
    downloadedByAdmin: {
      type: Boolean,
      default: false,
    },
    adminNotes: {
      type: String,
      default: '',
    },
    storageProvider: {
      type: String,
      enum: ['cloudinary', 'local', 'google_drive'],
      default: 'local',
    },
    driveFileId: {
      type: String,
      default: null,
    },
    driveFileLink: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

const Order = mongoose.model('Order', orderSchema);

module.exports = Order; 