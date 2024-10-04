const vscode = require('vscode');
const fs = require('fs');
const path = require('path');

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
	console.log('Congratulations, your extension "react-component-generate" is now active!');

	const disposable = vscode.commands.registerCommand('react-component-generate.createComponent', async function () {
		const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
		if (!workspaceFolder) {
			vscode.window.showErrorMessage('No workspace folder open');
			return;
		}

		let step = 'folder';
		let history = {
			targetFolder: '',
			componentName: '',
			hasProps: false,
			props: [],
			fileConvention: ''
		};
		const savedFolders = context.globalState.get('savedFolders', ['src/components']);

		while (true) {
			switch (step) {
				case 'folder':
					history.targetFolder = await selectFolder(savedFolders, history.targetFolder);
					if (history.targetFolder === undefined) return; // User cancelled
					if (history.targetFolder === null) {
						const newFolder = await createNewFolder();
						if (newFolder) {
							history.targetFolder = newFolder;
							savedFolders.push(newFolder);
							context.globalState.update('savedFolders', savedFolders);
						} else {
							continue; // Stay on the same step if folder creation was cancelled
						}
					}
					step = 'componentName';
					break;

				case 'componentName':
					history.componentName = await getComponentName(history.componentName);
					if (history.componentName === undefined) {
						step = 'folder'; // Go back to folder selection
					} else if (history.componentName) {
						step = 'hasProps';
					}
					break;

				case 'hasProps':
					history.hasProps = await askHasProps(history.hasProps);
					if (history.hasProps === undefined) {
						step = 'componentName'; // Go back to component name
					} else {
						step = history.hasProps ? 'props' : 'fileConvention';
					}
					break;

				case 'props':
					const result = await getProps(history.props);
					if (result === 'back') {
						step = 'hasProps';
						history.props = []; // Clear props if going back
					} else if (result === 'done') {
						step = 'fileConvention';
					}
					break;

				case 'fileConvention':
					history.fileConvention = await selectFileConvention();
					if (history.fileConvention === undefined) {
						step = history.hasProps ? 'props' : 'hasProps';
					} else {
						step = 'createFile';
					}
					break;

				case 'createFile':
					await createComponentFiles(workspaceFolder, history);
					return; // Exit the command after file creation
			}
		}
	});

	context.subscriptions.push(disposable);
}

async function selectFolder(savedFolders, previousFolder) {
	const items = [
		...savedFolders.map(folder => ({ label: folder, description: folder === previousFolder ? '(Previously selected)' : '' })),
		{ label: 'Create new folder...', description: '', },
		{ label: 'Back', description: '', }
	];

	const result = await vscode.window.showQuickPick(items, {
		placeHolder: 'Select or create a folder for the component'
	});

	if (!result) return undefined; // User cancelled
	if (result.label === 'Back') return undefined;
	if (result.label === 'Create new folder...') return null;
	return result.label;
}

async function createNewFolder() {
	return vscode.window.showInputBox({
		prompt: 'Enter the name of the new folder',
		validateInput: (value) => value ? null : 'Folder name is required'
	});
}

async function getComponentName(previousName) {
	const result = await vscode.window.showInputBox({
		prompt: 'Enter the name of the new component',
		value: previousName,
		validateInput: (value) => {
			return value && /^[A-Z][a-zA-Z0-9]*$/.test(value)
				? null
				: 'Component name should start with a capital letter and contain only alphanumeric characters';
		}
	});
	return result === '' ? undefined : result; // Treat empty string as 'Back'
}

async function askHasProps(previousChoice) {
	const items = [
		{ label: 'Yes', description: previousChoice === true ? '(Previously selected)' : '' },
		{ label: 'No', description: previousChoice === false ? '(Previously selected)' : '' },
		{ label: 'Back', description: '' }
	];

	const result = await vscode.window.showQuickPick(items, {
		placeHolder: 'Does this component have any props?'
	});

	if (!result) return undefined; // User cancelled
	if (result.label === 'Back') return undefined;
	return result.label === 'Yes';
}

async function getProps(existingProps) {
	while (true) {
		const propName = await vscode.window.showInputBox({
			prompt: 'Enter a prop name (or leave empty if done)',
			validateInput: (value) => {
				return !value || /^[a-zA-Z][a-zA-Z0-9]*$/.test(value)
					? null
					: 'Prop name should start with a letter and contain only alphanumeric characters';
			}
		});

		if (propName === undefined) return 'back'; // User cancelled
		if (propName === '') return 'done'; // User is done entering props

		const propTypeItems = [
			{ label: 'string', description: '' },
			{ label: 'number', description: '' },
			{ label: 'boolean', description: '' },
			{ label: 'object', description: '' },
			{ label: 'any', description: '' },
			{ label: 'Back', description: '' }
		];

		const propType = await vscode.window.showQuickPick(propTypeItems, {
			placeHolder: `Select the type for ${propName}`
		});

		if (!propType) continue; // User cancelled, ask for prop name again
		if (propType.label === 'Back') continue; // Go back to prop name input

		const existingPropIndex = existingProps.findIndex(p => p.name === propName);
		if (existingPropIndex !== -1) {
			existingProps[existingPropIndex] = { name: propName, type: propType.label };
		} else {
			existingProps.push({ name: propName, type: propType.label });
		}
	}
}

async function createComponentFile(workspaceFolder, history) {
	const { targetFolder, componentName, hasProps, props } = history;
	const fullPath = path.join(workspaceFolder.uri.fsPath, targetFolder, `${componentName}.tsx`);
	fs.mkdirSync(path.dirname(fullPath), { recursive: true });

	const propsContent = hasProps ? `interface ${componentName}Props {\n${props.map(p => `  ${p.name}: ${p.type}`).join('\n')}\n}\n\n` : '';
	const importStatement = hasProps ? "import { memo } from 'react'\n\n" : '';
	const exportStatement = hasProps ? `export default memo(${componentName})` : `export default ${componentName}`;

	const componentContent = `${importStatement}${propsContent}function ${componentName}(${hasProps ? `{ ${props.map(p => p.name).join(', ')} }: ${componentName}Props` : ''}) {
  return <div>${componentName}</div>
}

${componentName}.displayName = '${componentName}'
${exportStatement}
`;

	fs.writeFileSync(fullPath, componentContent);
	const document = await vscode.workspace.openTextDocument(fullPath);
	await vscode.window.showTextDocument(document);

	vscode.window.showInformationMessage(`Component ${componentName} created successfully in ${targetFolder}`);
}

async function selectFileConvention() {
	const options = [
		{ label: '1', description: '(Default) Single file in folder' },
		{ label: '2', description: 'Folder with component file and index.tsx' },
		{ label: '3', description: 'Folder with component file, index.tsx, and empty SCSS file' },
		{ label: '4', description: 'Folder with component file, index.tsx, and empty CSS file' },
		{ label: 'Back', description: '' }
	];

	const result = await vscode.window.showQuickPick(options, {
		placeHolder: 'Select the component file convention'
	});

	if (!result) return undefined; // User cancelled
	if (result.label === 'Back') return undefined;
	return result.label;
}

async function createComponentFiles(workspaceFolder, history) {
	const { targetFolder, componentName, hasProps, props, fileConvention } = history;
	const baseFolder = path.join(workspaceFolder.uri.fsPath, targetFolder);

	let componentFolder = baseFolder;
	if (fileConvention !== '1') {
		componentFolder = path.join(baseFolder, componentName);
		fs.mkdirSync(componentFolder, { recursive: true });
	}

	const componentContent = generateComponentContent(componentName, hasProps, props);
	const componentFilePath = path.join(componentFolder, `${componentName}.tsx`);
	fs.writeFileSync(componentFilePath, componentContent);

	if (fileConvention !== '1') {
		const indexContent = `import ${componentName} from './${componentName}';\n\nexport { ${componentName} };\nexport default ${componentName};`;
		const indexFilePath = path.join(componentFolder, 'index.tsx');
		fs.writeFileSync(indexFilePath, indexContent);

		if (fileConvention === '3' || fileConvention === '4') {
			const styleExt = fileConvention === '3' ? 'scss' : 'css';
			const styleFilePath = path.join(componentFolder, `${componentName}.${styleExt}`);
			fs.writeFileSync(styleFilePath, ''); // Create an empty style file
		}
	}

	const document = await vscode.workspace.openTextDocument(componentFilePath);
	await vscode.window.showTextDocument(document);

	vscode.window.showInformationMessage(`Component ${componentName} created successfully in ${targetFolder}`);
}

function generateComponentContent(componentName, hasProps, props) {
	const propsContent = hasProps ? `interface ${componentName}Props {\n${props.map(p => `  ${p.name}: ${p.type};`).join('\n')}\n}\n\n` : '';
	const importStatement = hasProps ? "import React, { memo } from 'react';\n\n" : "import React from 'react';\n\n";
	const exportStatement = hasProps ? `export default memo(${componentName});` : `export default ${componentName};`;

	return `${importStatement}${propsContent}function ${componentName}(${hasProps ? `props: ${componentName}Props` : ''}) {
  return <div>${componentName}</div>;
}

${componentName}.displayName = '${componentName}';
${exportStatement}
`;
}



function deactivate() { }

module.exports = {
	activate,
	deactivate
}