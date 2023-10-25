import { Algorithm, Cube } from 'insertionfinder'

const scramble = "B D2 L2 F R' F2 R' F2 R2 U2 L' D R' L U2 L' D2 R2 B2 U2 R' F2 U2 B2 L"
const skeleton = `(B D2 L2 F)
(R' F2 R' F2 R2 U2 L' D)
U2 L' U2 x'`
const cube = new Cube()
cube.twist(new Algorithm(scramble))
cube.twist(new Algorithm(skeleton))
const bestCube = cube.getBestPlacement()
const algorithm = new Algorithm(skeleton)
algorithm.clearFlags(6)
console.log(bestCube.placement)
algorithm.normalize()
console.log(algorithm.toString())
