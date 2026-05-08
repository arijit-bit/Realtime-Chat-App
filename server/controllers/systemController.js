// @desc    Lightweight endpoint for frontend-to-server connectivity checks
// @route   GET /api/system/ping
// @access  Public
const pingServer = async (req, res) => {
    res.status(200).json({
        success: true,
        message: 'Server is reachable',
        timestamp: new Date().toISOString()
    });
};

module.exports = {
    pingServer
};
