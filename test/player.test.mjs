import test from 'node:test';
import assert from 'node:assert/strict';
import {artworkUrl,displayDuration,activeLyricIndex} from '../public/player-utils.js';
test('small album art requests a high-resolution image from the same host',()=>{
 assert.equal(artworkUrl('https://lh3.googleusercontent.com/art=w120-h120-l90-rj'),'https://lh3.googleusercontent.com/art=w800-h800-l90-rj');
 assert.equal(artworkUrl('https://example.com/art=w120-h120'),'https://example.com/art=w120-h120');
 assert.equal(artworkUrl('javascript:alert(1)'),'');
});
test('unknown media duration retains catalog duration until metadata loads',()=>{
 assert.equal(displayDuration(NaN,240),240);assert.equal(displayDuration(0,240),240);assert.equal(displayDuration(239.8,240),239.8);assert.equal(displayDuration(NaN,undefined),0);
});
test('lyrics follow playback including seeking backwards',()=>{
 const lines=[{start:4},{start:12},{start:18}];assert.equal(activeLyricIndex(lines,0),-1);assert.equal(activeLyricIndex(lines,12),1);assert.equal(activeLyricIndex(lines,40),2);assert.equal(activeLyricIndex(lines,5),0);
});
