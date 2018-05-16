'use strict'

const libp2p = require('libp2p')
const TCP = require('libp2p-tcp')
const Mplex = require('libp2p-mplex')
const SECIO = require('libp2p-secio')
const PeerInfo = require('peer-info')
const MulticastDNS = require('libp2p-mdns')
const waterfall = require('async/waterfall')
const pull = require('pull-stream')
const Pushable = require('pull-pushable')
// const parallel = require('async/parallel')

class MyBundle extends libp2p {
  constructor (peerInfo) {
    const modules = {
      transport: [new TCP()],
      connection: {
        muxer: [Mplex],
        crypto: [SECIO]
      },
      discovery: [new MulticastDNS(peerInfo, { interval: 1000 })]
    }
    super(modules, peerInfo)
  }
}

function createNode (callback) {
  let node

  waterfall([
    (cb) => PeerInfo.create(cb),
    (peerInfo, cb) => {
      peerInfo.multiaddrs.add('/ip4/0.0.0.0/tcp/0')
      node = new MyBundle(peerInfo)
      node.start(cb)
    }
  ], (err) => callback(err, node))
}

const nodes = {}

createNode((err, node) => {
  if (err) { throw err }

  node.on('peer:discovery', (peer) => {
    const nodeId = peer.id.toB58String();
    if (!nodes[nodeId]) {
      console.log('Discovered:', peer.id.toB58String())
      nodes[nodeId] = peer
      node.dial(peer, () => {})
    }
  })

  node.on('peer:connect', (peer) => {
    console.log('Connection established to:', peer.id.toB58String())

    // Establish the chat stream
    // console.log(peer);
    node.dialProtocol(peer, '/chat/1.0.0', (err, conn) => {
      if (err) {
        throw err
      }
      console.log('nodeA dialed to nodeB on protocol: /chat/1.0.0')
      // Write operation. Data sent as a buffer
      const p = Pushable()
      pull(
        p,
        conn
      )
      // Sink, data converted from buffer to utf8 string
      pull(
        conn,
        pull.map((data) => {
          return data.toString('utf8').replace('\n', '')
        }),
        pull.drain(console.log)
      )

      process.stdin.setEncoding('utf8')
      process.openStdin().on('data', (chunk) => {
        var data = chunk.toString()
        p.push(data)
      })
    })
  })

  // Incoming connection handler
  node.handle('/chat/1.0.0', (protocol, conn) => {
    const p = Pushable()
    pull(
      p,
      conn
    )

    pull(
      conn,
      pull.map((data) => {
        return data.toString('utf8').replace('\n', '')
      }),
      pull.drain(console.log)
    )

    // process.stdin.setEncoding('utf8')
    // process.openStdin().on('data', (chunk) => {
    //   var data = chunk.toString()
    //   p.push(data)
    // })
  })

  // console.log('Listener ready, listening on:')
  // peerListener.multiaddrs.forEach((ma) => {
  //   console.log(ma.toString() + '/ipfs/' + idListener.toB58String())
  // })

})
