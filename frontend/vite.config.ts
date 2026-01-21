import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      registerType: 'prompt',
      devOptions: {
        enabled: true,
        type: 'module',
      },
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
      },
      includeAssets: [
        'favicon-16x16.png',
        'favicon-32x32.png',
        'apple-touch-icon.png',
        'logo.svg',
        'offline.html'
      ],
      manifest: {
        name: 'Sync School Management',
        short_name: 'Sync',
        description: 'Modern School Management System - Manage students, fees, attendance, and academics in one place.',
        theme_color: '#2563eb',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait-primary',
        start_url: '/',
        scope: '/',
        categories: ['education', 'finance', 'productivity'],
        lang: 'en',
        dir: 'ltr',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ],
        shortcuts: [
          {
            name: 'Dashboard',
            short_name: 'Dashboard',
            description: 'Go to your dashboard',
            url: '/',
            icons: [{ src: 'pwa-192x192.png', sizes: '192x192' }]
          },
          {
            name: 'Students',
            short_name: 'Students',
            description: 'View all students',
            url: '/students',
            icons: [{ src: 'pwa-192x192.png', sizes: '192x192' }]
          },
          {
            name: 'Make Payment',
            short_name: 'Pay Fees',
            description: 'Pay school fees online',
            url: '/pay',
            icons: [{ src: 'pwa-192x192.png', sizes: '192x192' }]
          }
        ],
        screenshots: [
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            form_factor: 'wide',
            label: 'Sync Dashboard'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            form_factor: 'narrow',
            label: 'Sync Mobile'
          }
        ],
        // P2: Share Target - Allow sharing TO the app
        share_target: {
          action: '/share-target',
          method: 'POST',
          enctype: 'multipart/form-data',
          params: {
            title: 'title',
            text: 'text',
            url: 'url',
            files: [
              {
                name: 'files',
                accept: ['application/pdf', 'image/*', 'text/*']
              }
            ]
          }
        },
        // P2: File Handlers - Handle PDF files
        file_handlers: [
          {
            action: '/open-file',
            accept: {
              'application/pdf': ['.pdf']
            }
          }
        ],
        // P2: Protocol Handlers - Handle custom URLs like sync://
        protocol_handlers: [
          {
            protocol: 'web+sync',
            url: '/handle-protocol?url=%s'
          }
        ],
        // P2: Handle Links - Capture navigation to app domain
        handle_links: 'preferred'
      }
    })
  ],
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.VITE_API_TARGET || 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
      },
      '/uploads': {
        target: process.env.VITE_API_TARGET || 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
      }
    }
  }
})
