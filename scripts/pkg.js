#!/usr/bin/env node

'use strict';

const _ = require('lodash');
const argv = require('yargs').argv;
const fs = require('fs-extra');
const Log = require('./../lib/logger');
const log = new Log({logLevelConsole: 'debug'});
const path = require('path');
const Promise = require('bluebird');
const Shell = require('./../lib/shell');
const shell = new Shell(log);
const util = require('./util');

// Lando info
const version = require('./../package.json').version;
const pkgOs = (process.platform !== 'darwin') ? process.platform : 'osx';
const pkgType = [pkgOs, 'x64', 'v' + version].join('-');
const pkgExt = (pkgOs === 'win32') ? '.exe' : '';
const cliPkgName = 'lando-' + pkgType + pkgExt;

// Files
const files = {
  dist: path.resolve('dist'),
  cli: {
    buildSrc: [
      path.resolve('bin'),
      path.resolve('lib'),
      path.resolve('plugins'),
      path.resolve('config.yml'),
      path.resolve('package.json'),
      path.resolve('yarn.lock'),
    ],
    build: path.resolve('build', 'cli'),
    dist: {
      src: path.resolve('build', 'cli', cliPkgName),
      dest: path.resolve('dist', 'cli', cliPkgName),
    },
  },
  installer: {
    buildSrc: [path.resolve('installer', process.platform)],
    build: path.resolve('build', 'installer'),
    dist: {
      src: path.resolve('build', 'installer', 'dist'),
      dest: path.resolve('dist'),
    },
  },
};

// Clean the dist directory
fs.emptyDirSync(files.dist);

// Get things based on args
let cleanDirs = [files.dist, files.cli.build];
let buildCopy = [{src: files.cli.buildSrc, dest: files.cli.build}];
let buildCmds = _.map(util.cliPkgTask(cliPkgName), cmd => (util.parseCommand(cmd, files.cli.build)));
let distCopy = [files.cli.dist];

// Add in extra stuff for the installer
if (argv.installer) {
  cleanDirs.push(files.installer.build);
  buildCopy.push({src: files.installer.buildSrc, dest: files.installer.build, direct: true});
  buildCmds.push(util.parseCommand(util.installerPkgTask()));
  distCopy.push(files.installer.dist);
}

// Declare things
log.info('Going to clean %j', cleanDirs);
log.info('Going to copy source from %j', _.map(buildCopy, 'src'));
log.info('Going to run %j', buildCmds);
log.info('Artifacts will live at %j', _.map(distCopy, 'dest'));

// Clean
_.forEach(cleanDirs, dir => {
  fs.emptyDirSync(dir);
  log.info('Cleaned up %s', dir);
});

// Copy
_.forEach(buildCopy, item => {
  _.forEach(item.src, dir => {
    const dest = (item.direct) ? item.dest : path.join(item.dest, path.basename(dir));
    fs.copySync(dir, dest, {overwrite: true});
    log.info('Copied source from %s to %s', dir, dest);
  });
});

// Run the commands
return Promise.resolve(buildCmds).each(cmd => shell.sh(cmd.run, cmd.opts))

// Move the built assetz
.then(() => Promise.resolve(distCopy)).each(item => fs.copySync(item.src, item.dest, {overwrite: true}))

// Catch errors and exit
.catch(err => {
  log.error(err);
  process.exit(444);
});
