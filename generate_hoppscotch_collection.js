const fs = require('fs');
const path = require('path');

const ROUTES_DIR = path.join(__dirname, 'routes');
const COLLECTION_FILE = path.join(__dirname, 'api_hoppscotch_collection.json');

const ROUTE_FILES = {
    'auth.js': '/api/auth',
    'googleAuth.js': '/api/auth',
    'customer.js': '/api/customer',
    'vendor.js': '/api/vendor',
    'products.js': '/api/products',
    'cart.js': '/api/cart',
    'reviews.js': '/api/reviews',
    'chat.js': '/api/chat',
    'payment.js': '/api/payment',
    'admin.js': '/api/admin'
};

const FOLDER_MAPPING = {
    '/api/auth': 'Auth',
    '/api/customer': 'Customer',
    '/api/vendor': 'Vendor',
    '/api/products': 'Products',
    '/api/cart': 'Cart',
    '/api/reviews': 'Reviews',
    '/api/chat': 'Chat',
    '/api/payment': 'Payment',
    '/api/admin': 'Admin'
};

function parseRoutes(filename, content) {
    const basePath = ROUTE_FILES[filename];
    if (!basePath) return [];

    const routes = [];
    // Regex to match router.VERB('PATH', ...
    const regex = /router\.(get|post|put|delete|patch)\(['"`]([^'"`]*)['"`]/g;

    let match;
    while ((match = regex.exec(content)) !== null) {
        const method = match[1].toUpperCase();
        let routePath = match[2];

        // Clean path (remove trailing slash unless it's just root)
        if (routePath.endsWith('/') && routePath.length > 1) {
            routePath = routePath.slice(0, -1);
        }

        // Construct full URL path for Hoppscotch
        // e.g. /api/auth + /login -> api/auth/login
        let fullPathString = basePath + routePath;
        // fix double slashes if any
        fullPathString = fullPathString.replace('//', '/');

        const name = `${method} ${fullPathString}`;

        routes.push({
            method,
            path: routePath,
            fullPath: fullPathString,
            name
        });
    }
    return routes;
}

function createRequestItem(route, basePath) {
    const urlPath = route.fullPath.split('/').filter(p => p);

    // Parse variables in path :id -> <id>
    const variables = [];
    const pathSegments = urlPath.map(segment => {
        if (segment.startsWith(':')) {
            const varName = segment.substring(1);
            variables.push({
                key: varName,
                value: `<${varName.toUpperCase()}>`
            });
            return segment; // keep :id in path for Hoppscotch visual? Or replace? 
            // Hoppscotch/Postman usually uses :variable syntax in path and then variable list
        }
        return segment;
    });

    const request = {
        name: route.name,
        request: {
            method: route.method,
            header: [
                {
                    key: "Content-Type",
                    value: "application/json"
                },
                {
                    key: "Authorization",
                    value: "Bearer <<token>>" // Default placeholder
                }
            ],
            url: {
                raw: `{{baseUrl}}${route.fullPath}`,
                host: ["{{baseUrl}}"],
                path: pathSegments,
                variable: variables.length > 0 ? variables : undefined
            }
        }
    };

    // Add default body for POST/PUT
    if (['POST', 'PUT', 'PATCH'].includes(route.method)) {
        request.request.body = {
            mode: "raw",
            raw: "{\n    \n}"
        };
    }

    return request;
}

function main() {
    let collection = {
        info: {
            "_postman_id": "wenzetiindaku-api-collection-hoppscotch",
            "name": "Wenze Tii Ndaku API (Hoppscotch)",
            "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
        },
        item: []
    };

    // Try to read existing file for 'info' if needed, but we regenerate structure
    if (fs.existsSync(COLLECTION_FILE)) {
        try {
            const existing = JSON.parse(fs.readFileSync(COLLECTION_FILE, 'utf8'));
            if (existing.info) collection.info = existing.info;
        } catch (e) {
            console.log("Could not parse existing collection, creating new.");
        }
    }

    const folders = {}; // Map 'FolderName' -> item array

    Object.keys(ROUTE_FILES).forEach(filename => {
        const filePath = path.join(ROUTES_DIR, filename);
        if (!fs.existsSync(filePath)) {
            console.log(`Skipping missing file: ${filename}`);
            return;
        }

        const content = fs.readFileSync(filePath, 'utf8');
        const routes = parseRoutes(filename, content);
        const basePath = ROUTE_FILES[filename];
        const folderName = FOLDER_MAPPING[basePath] || 'Other';

        if (!folders[folderName]) {
            folders[folderName] = [];
        }

        routes.forEach(route => {
            const item = createRequestItem(route, basePath);
            folders[folderName].push(item);
        });
    });

    // Convert folders map to collection items
    Object.keys(folders).sort().forEach(folderName => {
        collection.item.push({
            name: folderName,
            item: folders[folderName]
        });
    });

    fs.writeFileSync(COLLECTION_FILE, JSON.stringify(collection, null, 4));
    console.log(`Collection updated at ${COLLECTION_FILE}`);
}

main();
