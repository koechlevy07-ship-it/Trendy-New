{
  "name": "trendy-wardrobe-backend",
  "version": "0.1.0",
  "description": "Trendy Wardrobe — Luxury Fashion E-Commerce API",
  "private": true,
  "main": "src/server.js",
  "scripts": {
    "start": "node src/server.js",
    "dev": "nodemon src/server.js",
    "test": "echo \"No tests specified\" && exit 0"
  },
  "dependencies": {
    "express": "^4.19.2",
    "mongoose": "^8.5.1",
    "jsonwebtoken": "^9.0.2",
    "bcryptjs": "^2.4.3",
    "cloudinary": "^2.4.0",
    "multer": "^1.4.5-lts.1",
    "multer-storage-cloudinary": "^4.0.0",
    "dotenv": "^16.4.5",
    "cors": "^2.8.5",
    "helmet": "^7.1.0",
    "express-rate-limit": "^7.4.0",
    "express-validator": "^7.2.0",
    "morgan": "^1.10.0",
    "compression": "^1.7.4",
    "cookie-parser": "^1.4.6",
    "axios": "^1.7.4",
    "nodemailer": "^6.9.14"
  },
  "devDependencies": {
    "nodemon": "^3.1.4"
  },
  "engines": {
    "node": ">=18.0.0"
  }
}
