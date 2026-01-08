import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

const JWT_SECRET = process.env.JWT_SECRET || 'supersecretkey';

/**
 * Generate JWT token with user info
 * @param userId - User's unique ID
 * @param tenantId - Tenant (school) ID for multi-tenancy
 * @param role - User's role
 */
export const generateToken = (userId: string, tenantId: string, role: string) => {
  return jwt.sign({ userId, tenantId, role }, JWT_SECRET, { expiresIn: '24h' });
};

export const hashPassword = async (password: string) => {
  return await bcrypt.hash(password, 10);
};

export const comparePassword = async (password: string, hash: string) => {
  return await bcrypt.compare(password, hash);
};
