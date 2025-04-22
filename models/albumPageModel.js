const mongoose = require('mongoose');

const albumPageSchema = mongoose.Schema({
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    ref: 'Order',
  },
  pageId: {
    type: String,
    required: true,
  },
  dataUrl: {
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
  },
  createdAt: {
    type: Date,
    default: Date.now,
  }
});

// Create a compound index on orderId and pageId to ensure uniqueness
albumPageSchema.index({ orderId: 1, pageId: 1 }, { unique: true });

// Also create an index on orderId and position for efficient retrieval of pages in order
albumPageSchema.index({ orderId: 1, position: 1 });

const AlbumPage = mongoose.model('AlbumPage', albumPageSchema);

module.exports = AlbumPage; 