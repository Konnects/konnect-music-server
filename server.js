var express = require('express');
var app = express();
var http = require('http').createServer(app);
var io = require('socket.io')(http ,{
    cors: '*'
});

var uuidGen = require('uuid');

// io.attach(http, {
//     // pingInterval: 200000,
//     pingTimeout: 200000,
//     cookie: false
// });

const cors = require('cors');
const ytdl = require('@distube/ytdl-core');
const fs = require('fs');
const agent = ytdl.createAgent(JSON.parse(fs.readFileSync("cookies.json")));

app.use(express.static('public')); // loads all static assets from 'public' folder

// use cors
app.use(cors());

app.get('/', function (req, res) {
    res.sendFile(__dirname + '/view/audio.html');
});

// Old Streaming Service
app.get('/streaming', function (req, res) {
    try{
        var URL = req.query.URL;
        ////console.log(URL);

        res.header('Content-Disposition', 'attachment; filename="audio.ogg"');
        ytdl(URL, {
            // format: 'ogg'
            quality: 'lowest',
            filter: 'audioonly',
            agent: agent
        }).pipe(res);
    }
    catch (e) {
        ////console.log('Exception in YTDL : '+e);
    }
});


// [NEW] Stream Chunked Audio
app.get("/stream/:videoId", async (req, res) => {
    try {
        console.log('serving music');
        const { videoId } = req.params
        const isValid = ytdl.validateID(videoId, {agent: agent})

        if (!isValid) {
            throw new Error()
        }

        const videoInfo = await ytdl.getInfo(videoId, {agent: agent})
        let audioFormat = ytdl.chooseFormat(videoInfo.formats, {
            filter: "audioonly",
            quality: "highestaudio",
            agent: agent
        });

        const { itag, container, contentLength } = audioFormat

        // define headers
        const rangeHeader = req.headers.range || null
        const rangePosition = (rangeHeader) ? rangeHeader.replace(/bytes=/, "").split("-") : null
        // console.log(`rangePosition`, rangePosition);
        const startRange = rangePosition ? parseInt(rangePosition[0], 10) : 0;
        const endRange = rangePosition && rangePosition[1].length > 0 ? parseInt(rangePosition[1], 10) : contentLength - 1;
        const chunksize = (endRange - startRange) + 1;

        //         Send partial response
        res.writeHead(206, {
            'Content-Type': `audio/${container}`,
            'Content-Length': chunksize,
            "Content-Range": "bytes " + startRange + "-" + endRange + "/" + contentLength,
            "Accept-Ranges": "bytes",
        })

        const range = { start: startRange, end: endRange }
        const audioStream = ytdl(videoId, { filter: format => format.itag === itag, range })
        audioStream.pipe(res)

    } catch (error) {
        console.log(error);
        return res.status(500).send()
    }
});





app.get('/Terms', function (req, res) {
    res.sendFile(__dirname + '/view/Terms.html');
});

// api to get UUID v4
app.get('/api/uuid', (req,res) => {

    let responseJSON ={
        data : null,
        timestamp: null,
    }

    try{
        let uuid = uuidGen.v4();
        responseJSON.data = uuid;
    }catch(e){
        responseJSON.data = "error";
    }

    responseJSON.timestamp = new Date().getTime();
    res.json(responseJSON);
});








var roomno = 1;
// Set given room for url parameter
var given_room = ""

users = [];
connections = [];
rooms = [];
// Store all of the sockets and their respective room numbers
userrooms = {}



io.sockets.on('connection', function(socket) {
    // Connect Socket
    connections.push(socket);
    console.log('Connected: %s sockets connected', connections.length);

    // Set default room, if provided in url
    socket.emit('set id', {
        id: given_room
    })

    // io.sockets.emit('broadcast',{ description: connections.length + ' clients connected!'});

    // For now have it be the same room for everyone!
    //socket.join("room-"+roomno);

    //Send this event to everyone in the room.
    //io.sockets.in("room-"+roomno).emit('connectToRoom', "You are in room no. "+roomno);

    // reset url parameter
    // Workaround because middleware was not working right
    socket.on('reset url', function(data) {
        given_room = ""
    });

    // For Debugging
    socket.on('debugData', function(data){

        extras={
            users: users,
            connections: connections,
            rooms: rooms,
            userrooms: userrooms
        }

        ////console.log(extras);

    })

    // Get Room Details
    socket.on('getRoomDetailsByRoomID', function(data, callback){
        var roomnum = data.roomID
        var roomDetails = io.sockets.adapter.rooms['room-' + roomnum]
        callback(roomDetails);
    })


    // CHANGED
    socket.on('connectedStatus', function(data, callback){
        var id = socket.id
        var roomnum = userrooms[id]
        var room = io.sockets.adapter.rooms['room-' + roomnum]
        callback(room);
    })

    // get Room ID
    socket.on('getSelfRoomID', function(data, callback){
        var id = socket.id
        var roomnum = userrooms[id]

        callback(roomnum)
    })

    // count of people in room
    socket.on('getRoomPeopleCount', function(data, callback){
        var room = io.sockets.adapter.rooms['room-' + socket.roomnum].users
        callback(room);
    })

    // get Host
    socket.on('getHostDetails', function(data, callback){
        var hostDetails = io.sockets.adapter.rooms['room-' + socket.roomnum].host
        callback(hostDetails);
    })

    // Force Disconnect 
    socket.on('forceDisconnect', function(data) {
        // If socket username is found

        socket.leave("room-" + socket.roomnum);

        if (users.indexOf(socket.username) != -1) {
            users.splice((users.indexOf(socket.username)), 1);
            updateUsernames();
        }

        connections.splice(connections.indexOf(socket), 1);
        console.log(socket.id + ' Disconnected: %s sockets connected', connections.length);
        // ////console.log(io.sockets.adapter.rooms['room-' + socket.roomnum])
        // ////console.log(socket.roomnum)


        // HOST DISCONNECT
        // Need to check if current socket is the host of the roomnum
        // If it is the host, needs to auto assign to another socket in the room

        // Grabs room from userrooms data structure
        var id = socket.id
        var roomnum = userrooms[id]
        var room = io.sockets.adapter.rooms['room-' + roomnum]

        // If you are not the last socket to leave
        if (room !== undefined) {

            // if (room.sockets[id]){
            //     delete room.sockets[id]
            // }

            // If you are the host
            if (socket.id == room.host) {
                // Reassign
                console.log("hello i am the host " + socket.id + " and i am leaving my responsibilities to " + Object.keys(room.sockets)[0])
                io.to(Object.keys(room.sockets)[0]).emit('autoHost', {
                    roomnum: roomnum
                })
            }

            // Remove from users list
            // If socket username is found
            if (room.users.indexOf(socket.username) != -1) {
                room.users.splice((room.users.indexOf(socket.username)), 1);
                updateRoomUsers(roomnum);
            }

        }

        // Update peoples list when new user joins / leaves
        socket.broadcast.to("room-" + roomnum).emit('updatePeoplesList');

        // Delete socket from userrooms
        delete userrooms[id]
    })

    // Disconnect
    socket.on('disconnect', function(data) {

        // If socket username is found
        if (users.indexOf(socket.username) != -1) {
            users.splice((users.indexOf(socket.username)), 1);
            updateUsernames();
        }

        connections.splice(connections.indexOf(socket), 1);
        ////console.log(socket.id + ' Disconnected: %s sockets connected', connections.length);
        // ////console.log(io.sockets.adapter.rooms['room-' + socket.roomnum])
        // ////console.log(socket.roomnum)


        // HOST DISCONNECT
        // Need to check if current socket is the host of the roomnum
        // If it is the host, needs to auto assign to another socket in the room

        // Grabs room from userrooms data structure
        var id = socket.id
        var roomnum = userrooms[id]
        var room = io.sockets.adapter.rooms['room-' + roomnum]

        // If you are not the last socket to leave
        if (room !== undefined) {
            // If you are the host
            if (socket.id == room.host) {
                // Reassign
                console.log("hello i am the host " + socket.id + " and i am leaving my responsibilities to " + Object.keys(room.sockets)[0])
                io.to(Object.keys(room.sockets)[0]).emit('autoHost', {
                    roomnum: roomnum
                })
            }

            // Remove from users list
            // If socket username is found
            if (room.users.indexOf(socket.username) != -1) {
                room.users.splice((room.users.indexOf(socket.username)), 1);
                updateRoomUsers(roomnum);
            }
        }

        // Update peoples list when new user joins / leaves
        socket.broadcast.to("room-" + roomnum).emit('updatePeoplesList');

        // Delete socket from userrooms
        delete userrooms[id]
    });

    // ------------------------------------------------------------------------
    // New room
    socket.on('new room', function(data, callback) {
        //callback(true);
        // Roomnum passed through
        socket.roomnum = data;

        // This stores the room data for all sockets
        userrooms[socket.id] = data

        var host = null
        var init = false

        // Sets default room value to 1
        if (socket.roomnum == null || socket.roomnum == "") {
            socket.roomnum = '1'
            userrooms[socket.id] = '1'
        }

        // Adds the room to a global array
        if (!rooms.includes(socket.roomnum)) {
            rooms.push(socket.roomnum);
        }

        // Checks if the room exists or not
        // ////console.log(io.sockets.adapter.rooms['room-' + socket.roomnum] !== undefined)
        if (io.sockets.adapter.rooms['room-' + socket.roomnum] === undefined) {
            socket.send(socket.id)
            // Sets the first socket to join as the host
            host = socket.id
            init = true

            // Set the host on the client side
            socket.emit('setHost');
            //////console.log(socket.id)
        } else {
            host = io.sockets.adapter.rooms['room-' + socket.roomnum].host
        }

        // Actually join the room
        console.log(socket.username + ' || ' + socket.id + " || connected to room-" + socket.roomnum)
        socket.join("room-" + socket.roomnum);

        // Sets the default values when first initializing
        if (init) {
            // Sets the host
            io.sockets.adapter.rooms['room-' + socket.roomnum].host = host
            // Default Player
            io.sockets.adapter.rooms['room-' + socket.roomnum].currPlayer = 0
            // Default video
            io.sockets.adapter.rooms['room-' + socket.roomnum].currVideo = {
                yt: 'GJm7H9IP5SU',
            }
            // Previous Video
            io.sockets.adapter.rooms['room-' + socket.roomnum].prevVideo = {
                yt: {
                    id: 'M7lc1UVf-VE',
                    time: 0
                },
            }
            // Host username
            io.sockets.adapter.rooms['room-' + socket.roomnum].hostName = socket.username
            // Keep list of online users
            io.sockets.adapter.rooms['room-' + socket.roomnum].users = [socket.username]
            // Set an empty queue
            io.sockets.adapter.rooms['room-' + socket.roomnum].queue = {
                yt: [],
            }
        }

        // Set Queue
        updateQueueVideos()

        // Gets current video from room variable
        switch (io.sockets.adapter.rooms['room-' + socket.roomnum].currPlayer) {
            case 0:
                var currVideo = io.sockets.adapter.rooms['room-' + socket.roomnum].currVideo.yt
                break;
            default:
                ////console.log("Error invalid player id")
        }
        var currYT = io.sockets.adapter.rooms['room-' + socket.roomnum].currVideo.yt

        // Change the video player to current One
        switch (io.sockets.adapter.rooms['room-' + socket.roomnum].currPlayer) {
            case 0:
                // YouTube is default so do nothing
                break;
            default:
                ////console.log("Error invalid player id")
        }

        // Change the video to the current one
        socket.emit('changeVideoClient', {
            videoId: currVideo
        });

        // Get time from host which calls change time for that socket
        if (socket.id != host) {
            //socket.broadcast.to(host).emit('getTime', { id: socket.id });
            ////console.log("call the damn host " + host)

            // Set a timeout so the video can load before it syncs
            setTimeout(function() {
                socket.broadcast.to(host).emit('getData');
            }, 1000);
            //socket.broadcast.to(host).emit('getData');

            // Push to users in the room
            io.sockets.adapter.rooms['room-' + socket.roomnum].users.push(socket.username)

            // socket.emit('changeVideoClient', {
            //     videoId: currVideo
            // });

            // This calls back the function on the host client
            //callback(true)

            // DISABLE CONTROLS - DEPRECATED
            // socket.emit('hostControls');
        } else {
            console.log("I am the host")
            //socket.emit('auto sync');

            // Auto syncing is not working atm
            // socket.broadcast.to(host).emit('auto sync');
        }

        // Update peoples list when new user joins / leaves
        socket.broadcast.to("room-" + socket.roomnum).emit('updatePeoplesList');
        // Update online users
        updateRoomUsers(socket.roomnum)


        // This is all of the rooms
        // io.sockets.adapter.rooms['room-1'].currVideo = "this is the video"
        // ////console.log(io.sockets.adapter.rooms['room-1']);
    });
    // ------------------------------------------------------------------------



    // ------------------------------------------------------------------------
    // ------------------------- Socket Functions -----------------------------
    // ------------------------------------------------------------------------

    // Play video   
    socket.on('play video', function(data) {
        // CHANGED
        var roomnum = data.room
        var extras = data.extras

        io.sockets.adapter.rooms['room-' + socket.roomnum].currVideo.yt = extras;

        io.sockets.in("room-" + roomnum).emit('playVideoClient',{
            extras:extras
        });
    });

    // Event Listener Functions
    // Broadcast so host doesn't continuously call it on itself!
    socket.on('play other', function(data) {
        var roomnum = data.room
        socket.broadcast.to("room-" + roomnum).emit('justPlay');
    });

    socket.on('pause other', function(data) {
        var roomnum = data.room
        socket.broadcast.to("room-" + roomnum).emit('justPause');
    });

    socket.on('seek other', function(data) {
        var roomnum = data.room
        var currTime = data.time
        io.sockets.in("room-" + roomnum).emit('justSeek', {
            time: currTime
        });

        // Sync up
        // host = io.sockets.adapter.rooms['room-' + roomnum].host
        // ////console.log("let me sync "+host)
        // socket.broadcast.to(host).emit('getData');
    });

    socket.on('play next', function(data) {
        var nextObj = {};
        if (io.sockets.adapter.rooms['room-' + socket.roomnum] !== undefined) {

            if (io.sockets.adapter.rooms['room-' + socket.roomnum].queue.yt.length > 0) {
                // Gets the video id from the room object
                nextObj = io.sockets.adapter.rooms['room-' + socket.roomnum].queue.yt.shift()
            }


            // Remove video from the front end
            updateQueueVideos()
            let extras = {
                id: nextObj.id,
                title: nextObj.title,
                artist: nextObj.artist,
                user: nextObj.user,
                artwork: nextObj.artwork
            }

            // CHANGE Video Stuffs
            // Set prev video before changing
            io.sockets.adapter.rooms['room-' + socket.roomnum].prevVideo.yt = io.sockets.adapter.rooms['room-' + socket.roomnum].currVideo.yt
            // Set new video id
            io.sockets.adapter.rooms['room-' + socket.roomnum].currVideo.yt = extras
            
            io.sockets.in("room-" + socket.roomnum).emit('playVideoClient',{
                extras:extras
            });
        
        }
    });

    // Change to previous video
    socket.on('play previous', function(data) {
        if (io.sockets.adapter.rooms['room-' + socket.roomnum] !== undefined) {


            // This sets the videoId to the proper previous video
            var prevObj = io.sockets.adapter.rooms['room-' + socket.roomnum].prevVideo.yt

            let extras = {
                id: prevObj.id,
                title: prevObj.title,
                artist: prevObj.artist,
                user: prevObj.user,
                artwork: prevObj.artwork
            }

            // CHANGE Video Stuffs
            // Set prev video before changing
            io.sockets.adapter.rooms['room-' + socket.roomnum].prevVideo.yt = io.sockets.adapter.rooms['room-' + socket.roomnum].currVideo.yt
            // Set new video id
            io.sockets.adapter.rooms['room-' + socket.roomnum].currVideo.yt = extras

            io.sockets.in("room-" + socket.roomnum).emit('playVideoClient',{
                extras:extras
            });
        }
    })

    // Play a specific video from queue
    socket.on('play at', function(data) {
        if (io.sockets.adapter.rooms['room-' + socket.roomnum] !== undefined) {
            var idx = data.idx

            var songObj = io.sockets.adapter.rooms['room-' + socket.roomnum].queue.yt[idx]
            io.sockets.adapter.rooms['room-' + socket.roomnum].queue.yt.splice(idx, 1)

            updateQueueVideos()

            let extras = {
                id: songObj.id,
                title: songObj.title,
                artist: songObj.artist,
                user: songObj.user,
                artwork: songObj.artwork
            }
            
            // CHANGE Video Stuffs
            // Set prev video before changing
            io.sockets.adapter.rooms['room-' + socket.roomnum].prevVideo.yt = io.sockets.adapter.rooms['room-' + socket.roomnum].currVideo.yt
            // Set new video id
            io.sockets.adapter.rooms['room-' + socket.roomnum].currVideo.yt = extras
            
            io.sockets.in("room-" + socket.roomnum).emit('playVideoClient',{
                extras:extras
            });
        }
    })

    // Remove a specific video from queue
    socket.on('remove at', function(data) {
        if (io.sockets.adapter.rooms['room-' + socket.roomnum] !== undefined) {
            var idx = data.idx
            
            io.sockets.adapter.rooms['room-' + socket.roomnum].queue.yt.splice(idx, 1)

            updateQueueVideos()
            io.sockets.in("room-" + socket.roomnum).emit('updateQueueList');

        }
    })

    // Sync video
    socket.on('sync video', function(data) {
        if (io.sockets.adapter.rooms['room-' + socket.roomnum] !== undefined) {
            var roomnum = data.room
            var currTime = data.time
            var state = data.state
            var videoId = data.videoId
            var extras = data.extras
            
            // var videoId = io.sockets.adapter.rooms['room-'+roomnum].currVideo
            io.sockets.in("room-" + roomnum).emit('syncVideoClient', {
                time: currTime,
                state: state,
                videoId: videoId,
                playerId: 0,
                extras:extras // CHANGED
            })
        }
    });

    // updates queue on disconnection by host
    socket.on('forceUpdateQueue', function(data){
        io.sockets.adapter.rooms['room-' + socket.roomnum].queue.yt = data;
    })

    // Get queue of particlar room
    socket.on('getQueueList', function(data, callback){
        callback(io.sockets.adapter.rooms['room-' + socket.roomnum].queue.yt);
    })

    // Enqueue video
    // Gets title then calls back
    socket.on('enqueue video', function(data) {
        if (io.sockets.adapter.rooms['room-' + socket.roomnum] !== undefined) {
            test = false
            var user = data.user
            var id = data.id
            var title = data.title
            var artist = data.artist
            var artwork = data.artwork


            title = data.title
            io.sockets.adapter.rooms['room-' + socket.roomnum].queue.yt.push({
                id: id,
                title: title,
                artist: artist,
                user: user,
                artwork: artwork
            })
            
            // Update front end
            updateQueueVideos()

            io.sockets.in("room-" + socket.roomnum).emit('updateQueueList');
        }
    })

    // Enqueue playlist
    // Gets all of the playlist videos and enqueues them
    // Only supported for YouTube
    socket.on('enqueue playlist', function(data) {
        if (io.sockets.adapter.rooms['room-' + socket.roomnum] !== undefined) {
            var user = data.user
            var playlistId = data.playlistId
            switch (io.sockets.adapter.rooms['room-' + socket.roomnum].currPlayer) {
                case 0:
                    // See yt.js file
                    socket.emit('get playlist videos', {
                        playlistId: playlistId,
                        user: user,
                        api_key: YT3_API_KEY
                    })
                    break;
                case 1:
                    break;
                case 2:
                    break;
                case 3:
                    break;
                default:
                    ////console.log("Error invalid player id")
            }
        }
    })

    // Empty the queue
    socket.on('empty queue', function(data) {
        if (io.sockets.adapter.rooms['room-' + socket.roomnum] !== undefined) {
            switch (io.sockets.adapter.rooms['room-' + socket.roomnum].currPlayer) {
                case 0:
                    io.sockets.adapter.rooms['room-' + socket.roomnum].queue.yt = []
                    break;
                case 1:
                    io.sockets.adapter.rooms['room-' + socket.roomnum].queue.dm = []
                    break;
                case 2:
                    io.sockets.adapter.rooms['room-' + socket.roomnum].queue.vimeo = []
                    break;
                case 3:
                    io.sockets.adapter.rooms['room-' + socket.roomnum].queue.html5 = []
                    break;
                default:
                    ////console.log("Error invalid player id")
            }
            updateQueueVideos()
        }
    })

    // Change video
    socket.on('change video', function(data, callback) {
        if (io.sockets.adapter.rooms['room-' + socket.roomnum] !== undefined) {
            var roomnum = data.room
            var videoId = data.videoId
            var time = data.time
            var host = io.sockets.adapter.rooms['room-' + socket.roomnum].host

            // This changes the room variable to the video id
            // io.sockets.adapter.rooms['room-' + roomnum].currVideo = videoId

            // Set prev video before changing
            io.sockets.adapter.rooms['room-' + socket.roomnum].prevVideo.yt.id = io.sockets.adapter.rooms['room-' + socket.roomnum].currVideo.yt
            //io.sockets.adapter.rooms['room-' + socket.roomnum].prevVideo.yt.time = time
            // Set new video id
            io.sockets.adapter.rooms['room-' + socket.roomnum].currVideo.yt = videoId
            

            io.sockets.in("room-" + roomnum).emit('changeVideoClient', {
                videoId: videoId
            });

            // If called from previous video, do a callback to seek to the right time
            if (data.prev) {
                // Call back to return the video id
                callback()
            }

        }

        // Auto sync with host after 1000ms of changing video
        // NOT NEEDED ANYMORE, IN THE CHANGEVIDEOCLIENT FUNCTION
        // setTimeout(function() {
        //     socket.broadcast.to(host).emit('getData');
        // }, 1000);

        // ////console.log(io.sockets.adapter.rooms['room-1'])
    });

    // Change to previous video
    socket.on('change previous video', function(data, callback) {
        if (io.sockets.adapter.rooms['room-' + socket.roomnum] !== undefined) {
            var roomnum = data.room
            var host = io.sockets.adapter.rooms['room-' + socket.roomnum].host

            // This sets the videoId to the proper previous video
            switch (io.sockets.adapter.rooms['room-' + socket.roomnum].currPlayer) {
                case 0:
                    var videoId = io.sockets.adapter.rooms['room-' + socket.roomnum].prevVideo.yt.id
                    var time = io.sockets.adapter.rooms['room-' + socket.roomnum].prevVideo.yt.time
                    break;
                case 1:
                    var videoId = io.sockets.adapter.rooms['room-' + socket.roomnum].prevVideo.dm.id
                    var time = io.sockets.adapter.rooms['room-' + socket.roomnum].prevVideo.dm.time
                    break;
                case 2:
                    var videoId = io.sockets.adapter.rooms['room-' + socket.roomnum].prevVideo.vimeo.id
                    var time = io.sockets.adapter.rooms['room-' + socket.roomnum].prevVideo.vimeo.time
                    break;
                case 3:
                    var videoId = io.sockets.adapter.rooms['room-' + socket.roomnum].prevVideo.html5.id
                    var time = io.sockets.adapter.rooms['room-' + socket.roomnum].prevVideo.html5.time
                    break;
                default:
                    ////console.log("Error invalid player id")
            }

            ////console.log("Hot Swapping to Previous Video: " + videoId + " at current time: " + time)
            // Callback to go back to client to request the video change
            callback({
                videoId: videoId,
                time: time
            })
        }
    })

    // Get video id based on player
    socket.on('get video', function(callback) {
        if (io.sockets.adapter.rooms['room-' + socket.roomnum] !== undefined) {
            // Gets current video from room variable
            switch (io.sockets.adapter.rooms['room-' + socket.roomnum].currPlayer) {
                case 0:
                    var currVideo = io.sockets.adapter.rooms['room-' + socket.roomnum].currVideo.yt
                    break;
                case 1:
                    var currVideo = io.sockets.adapter.rooms['room-' + socket.roomnum].currVideo.dm
                    break;
                case 2:
                    var currVideo = io.sockets.adapter.rooms['room-' + socket.roomnum].currVideo.vimeo
                    break;
                case 3:
                    var currVideo = io.sockets.adapter.rooms['room-' + socket.roomnum].currVideo.html5
                    break;
                default:
                    ////console.log("Error invalid player id")
            }
            // Call back to return the video id
            callback(currVideo)
        }
    })

    // Change video player
    socket.on('change player', function(data) {
        if (io.sockets.adapter.rooms['room-' + socket.roomnum] !== undefined) {
            var roomnum = data.room
            var playerId = data.playerId

            io.sockets.in("room-" + roomnum).emit('pauseVideoClient');
            // ////console.log(playerId)
            switch (playerId) {
                case 0:
                    io.sockets.in("room-" + roomnum).emit('createYoutube', {});
                    break;
                case 1:
                    io.sockets.in("room-" + roomnum).emit('createDaily', {});
                    break;
                case 2:
                    io.sockets.in("room-" + roomnum).emit('createVimeo', {});
                    break;
                case 3:
                    io.sockets.in("room-" + roomnum).emit('createHTML5', {});
                    break;
                default:
                    ////console.log("Error invalid player id")
            }

            // This changes the room variable to the player id
            io.sockets.adapter.rooms['room-' + roomnum].currPlayer = playerId
            // ////console.log(io.sockets.adapter.rooms['room-' + socket.roomnum].currPlayer)

            // This syncs the host whenever the player changes
            host = io.sockets.adapter.rooms['room-' + socket.roomnum].host
            socket.broadcast.to(host).emit('getData')
        }

    })

    // Change video player
    socket.on('change single player', function(data) {
        if (io.sockets.adapter.rooms['room-' + socket.roomnum] !== undefined) {
            var playerId = data.playerId

            switch (playerId) {
                case 0:
                    socket.emit('createYoutube', {});
                    break;
                case 1:
                    socket.emit('createDaily', {});
                    break;
                case 2:
                    socket.emit('createVimeo', {});
                    break;
                case 3:
                    socket.emit('createHTML5', {});
                    break;
                default:
                    ////console.log("Error invalid player id")
            }
            // After changing the player, resync with the host
            host = io.sockets.adapter.rooms['room-' + socket.roomnum].host
            socket.broadcast.to(host).emit('getData')
        }
    })


    // Send Message in chat
    socket.on('send message', function(data) {
        var encodedMsg = data.replace(/</g, "&lt;").replace(/>/g, "&gt;");
        // ////console.log(data);
        io.sockets.in("room-" + socket.roomnum).emit('new message', {
            msg: encodedMsg,
            user: socket.username
        });
    });

    // New User
    socket.on('new user', function(data, callback) {
        callback(true);
        // Data is username
        var encodedUser = data.replace(/</g, "&lt;").replace(/>/g, "&gt;");
        socket.username = encodedUser;
        //////console.log(socket.username)
        users.push(socket.username);
        updateUsernames();
    });

    // Changes time for a specific socket
    socket.on('change time', function(data) {
        // ////console.log(data);
        var caller = data.id
        var time = data.time
        socket.broadcast.to(caller).emit('changeTime', {
            time: time
        });
    });

    // This just calls the syncHost function
    socket.on('sync host', function(data) {
        if (io.sockets.adapter.rooms['room-' + socket.roomnum] !== undefined) {
            //socket.broadcast.to(host).emit('syncVideoClient', { time: time, state: state, videoId: videoId });
            var host = io.sockets.adapter.rooms['room-' + socket.roomnum].host
            // If not host, recall it on host
            if (socket.id != host) {
                socket.broadcast.to(host).emit('getData')
            } else {
                socket.emit('syncHost')
            }
        }
    })

    // Emits the player status
    socket.on('player status', function(data) {
        // ////console.log(data);
        ////console.log(data)
    });

    // Change host
    socket.on('change host', function(data) {
        if (io.sockets.adapter.rooms['room-' + socket.roomnum] !== undefined) {
            
            var roomnum = data.room
            var newHost = socket.id
            var currHost = io.sockets.adapter.rooms['room-' + socket.roomnum].host

            // If socket is already the host!
            if (newHost != currHost) {
                ////console.log("I want to be the host and my socket id is: " + newHost);
                //////console.log(io.sockets.adapter.rooms['room-' + socket.roomnum])

                // Broadcast to current host and set false
                socket.broadcast.to(currHost).emit('unSetHost')
                // Reset host
                io.sockets.adapter.rooms['room-' + socket.roomnum].host = newHost
                // Broadcast to new host and set true
                socket.emit('setHost')

                io.sockets.adapter.rooms['room-' + socket.roomnum].hostName = socket.username
                // Update host label in all sockets
                io.sockets.in("room-" + roomnum).emit('changeHostLabel', {
                    username: socket.username
                })
                // Notify alert
                socket.emit('notify alerts', {
                    alert: 1,
                    user: socket.username
                })
            }
        }
    })

    // Get host data
    socket.on('get host data', function(data) {
        if (io.sockets.adapter.rooms['room-' + socket.roomnum] !== undefined) {
            var roomnum = data.room
            var host = io.sockets.adapter.rooms['room-' + roomnum].host

            // Broadcast to current host and set false
            // Call back not supported when broadcasting

            // Checks if it has the data, if not get the data and recursively call again
            if (data.currTime === undefined) {
                // Saves the original caller so the host can send back the data
                var caller = socket.id
                socket.broadcast.to(host).emit('getPlayerData', {
                    room: roomnum,
                    caller: caller
                })
            } else {
                var caller = data.caller
                // Call necessary function on the original caller
                socket.broadcast.to(caller).emit('compareHost', data);
            }
        }

    })

    // Calls notify functions
    socket.on('notify alerts', function(data) {
        var alert = data.alert
        ////console.log("entered notify alerts")
        var encodedUser = ""
        if (data.user) {
            encodedUser = data.user.replace(/</g, "&lt;").replace(/>/g, "&gt;")
        }

        switch (alert) {
            // Enqueue alert
            case 0:
                var encodedTitle = ""
                if (data.title) {
                    encodedTitle = data.title.replace(/</g, "&lt;").replace(/>/g, "&gt;")
                }
                io.sockets.in("room-" + socket.roomnum).emit('enqueueNotify', {
                    user: encodedUser,
                    title: encodedTitle
                })
                break;
                // Host Change Alert
            case 1:
                io.sockets.in("room-" + socket.roomnum).emit('changeHostNotify', {
                    user: encodedUser
                })
                break;
                // Empty Queue Alert
            case 2:
                io.sockets.in("room-" + socket.roomnum).emit('emptyQueueNotify', {
                    user: encodedUser
                })
                break;
                // Beta Message Alert
            case 3:
                ////console.log("yoyoyoyoyo")
                io.sockets.in("room-" + socket.roomnum).emit('betaNotify', {})
                break;
            default:
                ////console.log("Error alert id")
        }
    })

    //------------------------------------------------------------------------------
    // Async get current time
    socket.on('auto sync', function(data) {
        var async = require("async");
        var http = require("http");

        //Delay of 5 seconds
        var delay = 5000;

        async.forever(

            function(next) {
                // Continuously update stream with data
                //var time = io.sockets.in("room-"+1).emit('getTime', {});
                //Store data in database
                //////console.log(time);

                ////console.log("i am auto syncing")
                socket.emit('syncHost');

                //Repeat after the delay
                setTimeout(function() {
                    next();
                }, delay)
            },
            function(err) {
                console.error(err);
            }
        );
    });


    // Some update functions --------------------------------------------------
    // Update all users
    function updateUsernames() {
        // io.sockets.emit('get users', users);
        // ////console.log(users)
    }

    // Update the room usernames
    function updateRoomUsers(roomnum) {
        if (io.sockets.adapter.rooms['room-' + socket.roomnum] !== undefined) {
            var roomUsers = io.sockets.adapter.rooms['room-' + socket.roomnum].users
            io.sockets.in("room-" + roomnum).emit('get users', roomUsers)
        }
    }

    // Update the playlist/queue
    function updateQueueVideos() {
        if (io.sockets.adapter.rooms['room-' + socket.roomnum] !== undefined) {
            var vidlist = io.sockets.adapter.rooms['room-' + socket.roomnum].queue
            var currPlayer = io.sockets.adapter.rooms['room-' + socket.roomnum].currPlayer
            io.sockets.in("room-" + socket.roomnum).emit('get vidlist', {
                vidlist: vidlist,
                currPlayer: currPlayer,
            })
        }
    }

})







http.listen(process.env.PORT || 9999, function () {
    console.log('----=== SERVER STARTED ===----');
});