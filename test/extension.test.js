const assert = require('assert');
const vscode = require('vscode');
const path = require('path');
const fs = require('fs');
const sinon = require('sinon');
const mocha = require('mocha');

const suite = mocha.suite;
const test = mocha.test;

suite('React Component Generator Extension Test Suite', () => {
	vscode.window.showInformationMessage('Start all tests.');

	test('Extension should be present', () => {
		assert.ok(vscode.extensions.getExtension('CodeWithJavier.react-component-generate'));
	});


});