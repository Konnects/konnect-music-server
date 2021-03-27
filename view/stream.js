var express = require('express');
var router = express.Router();

const cors = require('cors');
const ytdl = require('ytdl-core');

router.use(cors());
// router.listen(4000, () => {
//     console.log('Server Works !!! At port 4000');
// });

router.get('/stream', (req, res) => {
    var URL = req.query.URL;
    res.header('Content-Disposition', 'attachment; filename="audio.ogg"');
    ytdl(URL, {
        // format: 'ogg'
        quality:'18'
    }).pipe(res);
});

// test endpoint to test /stream endpoint
router.get('/yt', (req, res) => {
    res.render('audio');
});

module.exports = router;