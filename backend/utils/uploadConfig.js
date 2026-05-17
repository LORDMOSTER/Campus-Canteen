const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Ensure upload directories exist
const uploadDirs = [
    'uploads',
    'uploads/profiles',
    'uploads/vendors',
    'uploads/menu-items'
];

uploadDirs.forEach(dir => {
    const fullPath = path.join(__dirname, '..', dir);
    if (!fs.existsSync(fullPath)) {
        fs.mkdirSync(fullPath, { recursive: true });
        console.log(`✅ Created directory: ${dir}`);
    }
});

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        let dest = 'uploads/';
        if (req.body.type === 'profile') dest += 'profiles/';
        else if (req.body.type === 'vendor') dest += 'vendors/';
        else if (req.body.type === 'menu-item') dest += 'menu-items/';

        cb(null, path.join(__dirname, '..', dest));
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const fileFilter = (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Only JPG, PNG, and WEBP images are allowed!'), false);
    }
};

const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
    fileFilter: fileFilter
});

module.exports = { upload };
