const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'WENZE TII NDAKU API',
      version: '1.0.0',
      description: 'Local/dev API reference for the WENZE TII NDAKU marketplace backend.'
    },
    servers: [
      { url: `http://localhost:${process.env.PORT || 5000}`, description: 'Local dev server' }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        }
      }
    }
  },
  apis: ['./routes/*.js']
};

module.exports = swaggerJsdoc(options);
