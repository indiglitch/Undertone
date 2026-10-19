import test from 'node:test';
import assert from 'node:assert/strict';
import {occurrenceKeys,selectRange} from './trackListModel.ts';
test('duplicate tracks keep independent history/playlist/queue identities after reordering',()=>{
 assert.deepEqual(occurrenceKeys([7,7,8]),['7:0','7:1','8:0']);
 assert.deepEqual(occurrenceKeys([7,7],[100,101]),['100','101']);
 assert.deepEqual(occurrenceKeys([7,7],[101,100]),['101','100']);
});
test('range selection works backwards, includes anchor and can extend a disjoint selection',()=>{
 const keys=['a','b','c','d'];
 assert.deepEqual([...selectRange(keys,'d','b',new Set(['a']))],['b','c','d']);
 assert.deepEqual([...selectRange(keys,'c','d',new Set(['a']),true)],['a','c','d']);
 assert.deepEqual([...selectRange(keys,null,'b',new Set())],['b']);
 assert.deepEqual([...selectRange(keys,'removed','c',new Set())],['c']);
 assert.deepEqual([...selectRange(keys,'a','missing',new Set(['d']))],['d']);
});
