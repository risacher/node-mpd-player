"use strict";

// TODO: implement Player.prototype.send, to replace self.mpd.send,
// but catch errors (such as when mpd has disconnected and is
// therefore undefined)

// TODO: the callback interface is stupid legacy from before the class
// was an EventEmitter.  Replace statusChangeCB with an Event. 

var util = require('util');
var MpdSocket = require('mpdsocket');
var EventEmitter = require('events').EventEmitter;
util.inherits(Player, EventEmitter);

function Player(statusChangeCB) {
    this.idle = false;
    this.status = { };
    this.statusChangeCB = statusChangeCB;
    this.restartMpd();
    return this;
}

Player.prototype.sendCmd = function (cmd, callback) {
    var self = this;
    if (this.idle) {
        try {
            // console.log('player sendCmd (idle): ', cmd);
            var idlecallback = this.mpd.callbacks.shift();
            this.idle = false;
            this.mpd.send('noidle', function (e, r) {
                //     console.log('player sendCmd (noidle): ', cmd);
                self.mpd.send(cmd, function (e, s) {
                    self.lock = false;
                    if (typeof(callback) == 'function') {
                        callback.call( undefined, s );
                    }
                    console.log('player cmd response: ', cmd);
                    self.mpd.send('idle', function (e, r) { self.processIdle.call(self, r); } );
                    self.idle = true;
                });
            });
        } catch (err) {
            console.log ("error in Player.sendCmd (idle branch): ", err);
            setTimeout(function () { self.mpd = self.restartMpd(); }, 1000);
        }
    } else {
        self.lock = true;
        // This is where it really crashed
        // It crashed again, even with teh try/catch block.  Why is that?
        try {
            this.mpd.send(cmd, function (e, s) {
                if (typeof(callback) == 'function') {
                    callback.call( undefined, s );
                }
                console.log('l52 player cmd response: ', cmd);
                // should I idle here?
            });
        } catch (err) {
            console.log ("error in Player.sendCmd (not idle branch): ", err);
            setTimeout(function () { self.mpd = self.restartMpd(); }, 1000);
        }
    }
};

Player.prototype.processIdle = function (r) {
    var self = this;
    this.idle = false;
    console.log("idle: ", r);
    try {
        this.mpd.send('status', function (e, r) { self.processStatus.call(self, r); } );
    } catch (err) {
        console.log ("error in Player.processIdle: ", err);
        setTimeout(function() { self.mpd = self.restartMpd(); }, 1000);        
    }
};

Player.prototype.processStatus = function (r) {
    //    console.log("status:" ,r);
    var self = this;
    var changed = false;
    if (typeof(r) == 'undefined') { return; }
    if (typeof(this.statusChangeCB) == 'function') {
        if ((r.state !== this.status.state) ||
            (r.playlist !== this.status.playlist) ||
            (r.songid !== this.status.songid)) {
            this.statusChangeCB.call(self, r);
        }
    }
    this.status = r;
    try {
        this.mpd.send('idle', function (e, r) { self.processIdle.call(self, r); } );
        this.idle = true;
    } catch (err) {
        console.log ("error in Player.processStatus: ", err);
        setTimeout(function () { self.mpd = self.restartMpd(); }, 1000);
    } 
};

Player.prototype.restartMpd = function () {
    var self = this;
    try {
        this.mpd = new MpdSocket('raspberrypi', 6600);
        this.mpd.on('connect', function () {
            self.emit('connect');
            console.log('mpd connected');
            if (typeof self.mpd == 'undefined') { console.log(' apparent instant disconnect '); return; }
            self.mpd.send('status', function (e, r) {
                console.log("e: ", e);
                console.log("r: ", r);
                self.statusChangeCB(r);
                self.mpd.send('idle', function (e, r) { self.processIdle(r); });
                self.idle = true;
            });
        });
    }
    catch (e) {
        console.log ("error connecting to mpd:",e);
        setTimeout(function () { self.mpd = self.restartMpd(); }, 60*1000); 
    }
    this.mpd.on('end', function() {
        self.emit('disconnect');
        console.log('mpd disconnected');
        setTimeout(function () { self.mpd = self.restartMpd(); }, 1000);
    });    
};    

module.exports = Player;
