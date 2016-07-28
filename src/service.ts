/**
 * Created by andrey on 28/07/2016.
 */

import monitor = require('node-docker-monitor');
import ContainerInfo = require("node-docker-monitor/lib/index");
const Etcd = require('node-etcd');

// process input via env vars
let dockerOpts: any = { socketPath: process.env.DOCKER_SOCKET };
if (!dockerOpts.socketPath) {
    dockerOpts.host = process.env.DOCKER_HOST;
    dockerOpts.port = process.env.DOCKER_PORT;
    if (!dockerOpts.host) {
        dockerOpts.socketPath = '/var/run/docker.sock';
    }
}

let etcdHosts = ['http://127.0.0.1:2379'];
if (process.env.ETCD_HOSTS) {
    etcdHosts = process.env.ETCD_HOSTS.split(',');
}

const homeDomain = process.env.HOME_DOMAIN || 'cluster.local';
const dnsEntryPrefix = '/skydns/' + homeDomain.split('.').reverse().join('/') + '/';

const etcd = new Etcd(etcdHosts);

monitor({
    onContainerUp: (containerInfo, docker) => {
        const dnsEntryPath = getDnsEntryPath(containerInfo);
        if (!dnsEntryPath) {
            return;
        }

        const container = docker.getContainer(containerInfo.Id);
        container.inspect(null, (err, containerDetails) => {
            const ip = containerDetails.NetworkSettings.IPAddress;
            if (ip) {
                const value = JSON.stringify({ host: ip });
                console.log('Creating DNS entry %s for %s', dnsEntryPath, value);
                etcd.set(dnsEntryPath, value, err => {
                    if (err) {
                        console.log('Error setting etcd value', err);
                    }
                });
            } else {
                console.log('Could not determine IP address of %s', containerInfo.Id)
            }
        });
    },

    onContainerDown: (containerInfo) => {
        const dnsEntryPath = getDnsEntryPath(containerInfo);
        if (!dnsEntryPath) {
            return;
        }

        console.log('Deleting DNS entry %s', dnsEntryPath);
        etcd.del(dnsEntryPath, err => {
            if (err) {
                console.log('Error deleting etcd value', err);
            }
        });
    },

    onMonitorStarted: () => {
        console.log('Started Docker SkyDNS adaptor');
    },

    onMonitorStopped: null
}, dockerOpts);

function getDnsEntryPath(containerInfo) {
    if (containerInfo.Labels.skydns_host) {
        return dnsEntryPrefix + (containerInfo.Labels.skydns_host).split('.').reverse().join('/');
    }
}