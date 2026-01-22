/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
        "./node_modules/flyonui/dist/js/*.js" // Include FlyonUI JS for components
    ],
    theme: {
        extend: {},
    },
    plugins: [
        require('flyonui'),
        require('flyonui/plugin') // If required by specific version, commonly just 'flyonui' handles it or includes the plugin
    ],
}
