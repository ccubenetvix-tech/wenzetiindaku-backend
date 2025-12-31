const validateRequest = (schema) => async (req, res, next) => {
    try {
        const result = await schema.safeParseAsync(req.body);

        if (!result.success) {
            // Format Zod errors
            const formattedErrors = result.error.issues.map(issue => ({
                field: issue.path.join('.'),
                message: issue.message
            }));

            return res.status(400).json({
                success: false,
                error: {
                    message: 'Validation failed',
                    details: formattedErrors
                }
            });
        }

        // Replace body with validated data (strips unknown keys if schema is strict, 
        // but Zod default is strip so this is good for security)
        req.body = result.data;
        next();
    } catch (error) {
        console.error('Validation error:', error);
        res.status(500).json({
            success: false,
            error: { message: 'Internal server error during validation' }
        });
    }
};

module.exports = validateRequest;
