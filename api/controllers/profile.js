module.exports.profileRead = (req, res) => {
    console.log(`Reading profile ID: ${req.params.userid}`);
    res.status(200);
    res.json({
        message: `Profile read: ${req.params.userid}`
    });
};