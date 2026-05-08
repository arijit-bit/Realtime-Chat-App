const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    email: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true
    },
    password: {
        type: String,
        required: true
    },
    avatar: {
        type: String,
        default: ''
    },
    onlineStatus: {
        type: Boolean,
        default: false
    },
    contacts: {
        type: [String], // array of contact emails
        default: []
    },
    autoPilot: {
        enabled: {
            type: Boolean,
            default: false
        },
        scope: {
            type: String,
            enum: ['all', 'selected'],
            default: 'all'
        },
        selectedContacts: [{
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        }]
    }
}, {
    timestamps: true // Automatically creates 'createdAt' and 'updatedAt'
});

// Middleware to hash the password before saving
userSchema.pre('save', async function() {
    if (!this.isModified('password')) {
        return;
    }
    
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
});

// Method to verify password match
userSchema.methods.matchPassword = async function(enteredPassword) {
    return await bcrypt.compare(enteredPassword, this.password);
};

// Safely remove sensitive fields from JSON output and map _id to id
userSchema.set('toJSON', {
    virtuals: true,
    versionKey: false,
    transform: function (doc, ret) {
        ret.id = ret._id;
        delete ret._id;
        delete ret.password;
    }
});

const User = mongoose.model('User', userSchema);

module.exports = User;
