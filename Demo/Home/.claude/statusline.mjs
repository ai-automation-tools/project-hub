#!/usr/bin/env node
// Status line: branch, dirty count, and the model in play. Nothing that needs a network
// call -- this runs on every prompt, and a slow status line is a slow terminal.
import { execFileSync } from 'node:child_process';

const git = (args) => {
  try { return execFileSync('git', args, { encoding: 'utf8' }).trim(); }
  catch { return ''; }
};

const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']) || 'no-git';
const dirty = git(['status', '--porcelain']).split('\n').filter(Boolean).length;
const input = JSON.parse(process.argv[2] || '{}');

const parts = [branch];
if (dirty) parts.push(dirty + ' changed');
if (input.model) parts.push(input.model);
process.stdout.write(parts.join(' - '));
