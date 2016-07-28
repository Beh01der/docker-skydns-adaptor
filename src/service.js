/**
 * Created by andrey on 28/07/2016.
 */
"use strict";
var monitor = require('node-docker-monitor');
var Etcd = require('node-etcd');
// process input via env vars
var dockerOpts = { socketPath: process.env.DOCKER_SOCKET };
if (!dockerOpts.socketPath) {
    dockerOpts.host = process.env.DOCKER_HOST;
    dockerOpts.port = process.env.DOCKER_PORT;
    if (!dockerOpts.host) {
        dockerOpts.socketPath = '/var/run/docker.sock';
    }
}
var etcdHosts = ['http://127.0.0.1:2379'];
if (process.env.ETCD_HOSTS) {
    etcdHosts = process.env.ETCD_HOSTS.split(',');
}
var homeDomain = process.env.HOME_DOMAIN || 'cluster.local';
var dnsEntryPrefix = '/skydns/' + homeDomain.split('.').reverse().join('/') + '/';
var etcd = new Etcd(etcdHosts);
monitor({
    onContainerUp: function (containerInfo, docker) {
        var dnsEntryPath = getDnsEntryPath(containerInfo);
        if (!dnsEntryPath) {
            return;
        }
        var container = docker.getContainer(containerInfo.Id);
        container.inspect(null, function (err, containerDetails) {
            var ip = containerDetails.NetworkSettings.IPAddress;
            if (ip) {
                var value = JSON.stringify({ host: ip });
                console.log('Creating DNS entry %s for %s', dnsEntryPath, value);
                etcd.set(dnsEntryPath, value, function (err) {
                    if (err) {
                        console.log('Error setting etcd value', err);
                    }
                });
            }
            else {
                console.log('Could not determine IP address of %s', containerInfo.Id);
            }
        });
    },
    onContainerDown: function (containerInfo) {
        var dnsEntryPath = getDnsEntryPath(containerInfo);
        if (!dnsEntryPath) {
            return;
        }
        console.log('Deleting DNS entry %s', dnsEntryPath);
        etcd.del(dnsEntryPath, function (err) {
            if (err) {
                console.log('Error deleting etcd value', err);
            }
        });
    },
    onMonitorStarted: function () {
        console.log('Started Docker SkyDNS adaptor');
    },
    onMonitorStopped: null
}, dockerOpts);
function getDnsEntryPath(containerInfo) {
    if (containerInfo.Labels.skydns_host) {
        return dnsEntryPrefix + (containerInfo.Labels.skydns_host).split('.').reverse().join('/');
    }
}
