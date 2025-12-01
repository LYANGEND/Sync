import React, { useState, useEffect, useRef } from 'react';
import { User, Mail, Camera, Lock, Save, Upload, Image as ImageIcon } from 'lucide-react';
import api from '../../utils/api';
import { useAuth } from '../../context/AuthContext';
import CameraModal from '../../components/CameraModal';

const Profile = () => {
  const { user, login } = useAuth(); // Assuming login updates the user context
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  
  const [passwords, setPasswords] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (file: File) => {
    setUploading(true);
    const formData = new FormData();
    formData.append('image', file);

    try {
      const response = await api.post('/profile/picture', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      
      // Update local user state if possible, or reload
      // Ideally, useAuth should expose a method to update user data
      alert('Profile picture updated!');
      window.location.reload(); // Simple reload to fetch new data
    } catch (error) {
      console.error('Upload failed', error);
      alert('Failed to upload profile picture');
    } finally {
      setUploading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFileUpload(e.target.files[0]);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passwords.newPassword !== passwords.confirmPassword) {
      alert("New passwords don't match");
      return;
    }

    setLoading(true);
    try {
      await api.post('/profile/password', {
        currentPassword: passwords.currentPassword,
        newPassword: passwords.newPassword
      });
      alert('Password updated successfully');
      setPasswords({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (error: any) {
      alert(error.response?.data?.message || 'Failed to update password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto pb-20">
      <h1 className="text-2xl font-bold text-gray-800 mb-6">My Profile</h1>

      {/* Profile Header */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6 flex flex-col items-center">
        <div className="relative mb-4 group">
          <div className="w-32 h-32 rounded-full overflow-hidden border-4 border-blue-50 bg-gray-100">
            {user?.profilePictureUrl ? (
              <img 
                src={user.profilePictureUrl.startsWith('http') ? user.profilePictureUrl : `${import.meta.env.VITE_API_URL || ''}${user.profilePictureUrl}`} 
                alt="Profile" 
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-400">
                <User size={48} />
              </div>
            )}
          </div>
          
          <div className="absolute bottom-0 right-0 flex gap-2">
            <button 
              onClick={() => setShowCamera(true)}
              className="p-2 bg-blue-600 text-white rounded-full shadow-lg hover:bg-blue-700 transition-colors"
              title="Take Photo"
            >
              <Camera size={18} />
            </button>
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="p-2 bg-white text-gray-600 border border-gray-200 rounded-full shadow-lg hover:bg-gray-50 transition-colors"
              title="Upload Photo"
            >
              <Upload size={18} />
            </button>
          </div>
          <input 
            type="file" 
            ref={fileInputRef} 
            className="hidden" 
            accept="image/*" 
            onChange={handleFileChange} 
          />
        </div>

        <h2 className="text-xl font-bold text-gray-900">{user?.fullName}</h2>
        <p className="text-sm text-gray-500 capitalize">{user?.role?.replace('_', ' ').toLowerCase()}</p>
        
        {uploading && <p className="text-sm text-blue-600 mt-2 animate-pulse">Uploading...</p>}
      </div>

      {/* User Info */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
          <User size={20} className="text-blue-600" />
          Personal Information
        </h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-500 mb-1">Full Name</label>
            <div className="p-3 bg-gray-50 rounded-lg text-gray-900">{user?.fullName}</div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-500 mb-1">Email Address</label>
            <div className="p-3 bg-gray-50 rounded-lg text-gray-900 flex items-center gap-2">
              <Mail size={16} className="text-gray-400" />
              {user?.email}
            </div>
          </div>
        </div>
      </div>

      {/* Change Password */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
          <Lock size={20} className="text-blue-600" />
          Security
        </h3>
        <form onSubmit={handlePasswordChange} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Current Password</label>
            <input
              type="password"
              required
              value={passwords.currentPassword}
              onChange={e => setPasswords({...passwords, currentPassword: e.target.value})}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">New Password</label>
            <input
              type="password"
              required
              minLength={6}
              value={passwords.newPassword}
              onChange={e => setPasswords({...passwords, newPassword: e.target.value})}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Confirm New Password</label>
            <input
              type="password"
              required
              minLength={6}
              value={passwords.confirmPassword}
              onChange={e => setPasswords({...passwords, confirmPassword: e.target.value})}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div className="pt-2">
            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:bg-gray-400 transition-colors"
            >
              <Save size={18} />
              {loading ? 'Updating...' : 'Update Password'}
            </button>
          </div>
        </form>
      </div>

      <CameraModal 
        isOpen={showCamera} 
        onClose={() => setShowCamera(false)} 
        onCapture={handleFileUpload} 
      />
    </div>
  );
};

export default Profile;
