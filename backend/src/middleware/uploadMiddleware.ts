import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';
import {
  createTenantFileReference,
  getUploadsRoot,
  TenantFileCategory,
} from '../services/tenantFileService';

// Use process.cwd() for uploads so paths work in both dev and production (Docker)
const uploadsRoot = getUploadsRoot();

// Ensure upload directories exist
fs.mkdirSync(uploadsRoot, { recursive: true });

const tenantUploadDirectory = (req: any, category: TenantFileCategory) => {
  const tenantId = req.user?.tenantId;
  if (!tenantId) {
    throw new Error('Tenant context is required for uploads');
  }
  createTenantFileReference(tenantId, category, 'placeholder.png');
  const directory = path.join(uploadsRoot, tenantId, category);
  fs.mkdirSync(directory, { recursive: true });
  return directory;
};

const IMAGE_EXTENSIONS: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

const profileStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    try { cb(null, tenantUploadDirectory(req, 'profiles')); } catch (error) { cb(error as Error, ''); }
  },
  filename: (req, file, cb) => {
    const extension = IMAGE_EXTENSIONS[file.mimetype];
    cb(null, `image-${Date.now()}-${randomUUID()}${extension}`);
  }
});

const logoStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    try { cb(null, tenantUploadDirectory(req, 'logos')); } catch (error) { cb(error as Error, ''); }
  },
  filename: (req, file, cb) => {
    // Use a fixed name for school logo so it's easy to reference
    const ext = IMAGE_EXTENSIONS[file.mimetype];
    cb(null, 'school-logo' + ext);
  }
});

const imageFilter = (req: any, file: any, cb: any) => {
  if (IMAGE_EXTENSIONS[file.mimetype]) {
    cb(null, true);
  } else {
    cb(new Error('Only JPEG, PNG, WebP, and GIF images are supported.'), false);
  }
};

export const uploadProfilePicture = multer({
  storage: profileStorage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: imageFilter
});

export const uploadSchoolLogo = multer({
  storage: logoStorage,
  limits: {
    fileSize: 2 * 1024 * 1024 // 2MB limit for logos
  },
  fileFilter: imageFilter
});
