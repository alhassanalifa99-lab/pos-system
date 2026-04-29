import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [
        react(),
        VitePWA({
            registerType: 'autoUpdate',
            manifest: {
                name: 'POS System',
                short_name: 'POS',
                description: 'Point of Sale System',
                theme_color: '#000000',
                background_color: '#ffffff',
                display: 'standalone',
                start_url: '/',
                scope: '/',
                icons: [
                    {
                        src: '/vite.svg',
                        sizes: '192x192',
                        type: 'image/svg+xml',
                        purpose: 'any'
                    }
                ]
            },
            workbox: {
                globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
                runtimeCaching: [
                    {
                        urlPattern: /^https:\/\/.*/,
                        handler: 'NetworkFirst',
                        options: {
                            cacheName: 'offlineCache',
                            expiration: {
                                maxEntries: 200
                            }
                        }
                    }
                ]
            }
        })
    ],
})