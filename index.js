var secure = require('secure-peer');
var pty = require('pty.js');
var spawn = require('child_process').spawn;
var muxDemux = require('mux-demux');
var through = require('through');
var duplexer = require('duplexer');
var Terminal = require('headless-terminal');
var render = require('./lib/render');

module.exports = function (keys) {
    return new Shux(keys);
};

function Shux (keys) {
    this.peer = secure(keys);
    this.shells = {};
}

Shux.prototype.list = function () {
    return Object.keys(this.shells);
};

Shux.prototype.attach = function (id, opts) {
    if (!opts) opts = {};
    var sh = this.shells[id];
    if (!sh) return;
    
    if (opts.columns && opts.rows) {
        sh.ps.resize(Number(opts.columns), Number(opts.rows));
    }
    
    var stdin = through();
    var stdout = through();
    
    stdin.pipe(sh.ps, { end: false });
    sh.ps.pipe(stdout);
    
    process.nextTick(function () {
        var x = sh.terminal.x + 1;
        var y = sh.terminal.y + 1;
        stdout.write(Buffer.concat([
            Buffer([ 0x1b, 0x63 ]),
            render(sh.terminal.displayBuffer),
            Buffer([ 0x1b, 0x5b ]),
            Buffer(y + ';' + x + 'f')
        ]));
    });
    return duplexer(stdin, stdout);
};

Shux.prototype.destroy = function (id, sig) {
    var sh = this.shells[id];
    if (!sh) return false;
    sh.kill(sig);
    return true;
};

Shux.prototype.createShell = function (opts) {
    var self = this;
    if (!opts) opts = {};
    if (opts.columns) opts.columns = Number(opts.columns);
    if (opts.rows) opts.rows = Number(opts.rows);
    
    var cmd = opts.command || 'bash';
    var args = opts.arguments || [];
    if (Array.isArray(cmd)) {
        args = cmd.slice(1);
        cmd = cmd[0];
    }
    
    var id = opts.id;
    if (id === undefined) {
        id = Math.floor(Math.pow(16,4) * Math.random()).toString(16);
    }
    
    var ps = pty.spawn(cmd, args, {
        cwd: '/',
        cols: opts.columns,
        rows: opts.rows,
        cwd: opts.cwd
    });
    ps.on('exit', function () {
        delete self.shells[id];
        ps.emit('end');
    });
    
    var term = new Terminal(opts.columns, opts.rows);
    term.open();
    ps.on('data', function (buf) { term.write(buf) });
    
    this.shells[id] = { ps: ps, terminal: term };
    return this.attach(id);
};
