"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadSchoolLogo = exports.uploadProfilePicture = void 0;
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const uploadDir = path_1.default.join(__dirname, '../../uploads/profiles');
const logoDir = path_1.default.join(__dirname, '../../uploads/logos');
// Ensure upload directories exist
if (!fs_1.default.existsSync(uploadDir)) {
    fs_1.default.mkdirSync(uploadDir, { recursive: true });
}
if (!fs_1.default.existsSync(logoDir)) {
    fs_1.default.mkdirSync(logoDir, { recursive: true });
}
const profileStorage = multer_1.default.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path_1.default.extname(file.originalname));
    }
});
const logoStorage = multer_1.default.diskStorage({
    destination: (req, file, cb) => {
        cb(null, logoDir);
    },
    filename: (req, file, cb) => {
        // Use a fixed name for school logo so it's easy to reference
        const ext = path_1.default.extname(file.originalname);
        cb(null, 'school-logo' + ext);
    }
});
const imageFilter = (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
        cb(null, true);
    }
    else {
        cb(new Error('Not an image! Please upload an image.'), false);
    }
};
exports.uploadProfilePicture = (0, multer_1.default)({
    storage: profileStorage,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit
    },
    fileFilter: imageFilter
});
exports.uploadSchoolLogo = (0, multer_1.default)({
    storage: logoStorage,
    limits: {
        fileSize: 2 * 1024 * 1024 // 2MB limit for logos
    },
    fileFilter: imageFilter
});
