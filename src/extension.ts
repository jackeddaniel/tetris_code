import * as vscode from 'vscode';

const VIEW_TYPE = 'tetrisBeside';

// Only one game panel at a time; reveal it instead of opening a second.
let currentPanel: vscode.WebviewPanel | undefined;

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand('tetris.start', () => {
      if (currentPanel) {
        currentPanel.reveal(vscode.ViewColumn.Beside);
        return;
      }

      const mediaRoot = vscode.Uri.joinPath(context.extensionUri, 'media');
      currentPanel = vscode.window.createWebviewPanel(
        VIEW_TYPE,
        'Tetris',
        vscode.ViewColumn.Beside,
        {
          enableScripts: true,
          localResourceRoots: [mediaRoot],
          // retainContextWhenHidden intentionally omitted: hiding/closing resets the game.
        }
      );
      currentPanel.iconPath = vscode.Uri.joinPath(context.extensionUri, 'images', 'icon.png');

      currentPanel.webview.html = getHtml(currentPanel.webview, mediaRoot);
      currentPanel.onDidDispose(() => {
        currentPanel = undefined;
      }, null, context.subscriptions);
    })
  );

  // One-click launcher in the status bar, toggled by the tetris.showStatusBarButton setting.
  const statusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusItem.text = '$(play) Tetris';
  statusItem.tooltip = 'Tetris: Play Beside';
  statusItem.command = 'tetris.start';
  context.subscriptions.push(statusItem);

  const syncStatusItem = () => {
    const show = vscode.workspace.getConfiguration('tetris').get<boolean>('showStatusBarButton', true);
    if (show) {
      statusItem.show();
    } else {
      statusItem.hide();
    }
  };
  syncStatusItem();
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('tetris.showStatusBarButton')) {
        syncStatusItem();
      }
    })
  );
}

export function deactivate() {}

function getHtml(webview: vscode.Webview, mediaRoot: vscode.Uri): string {
  const nonce = getNonce();
  const gameUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaRoot, 'game.js'));
  const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaRoot, 'style.css'));
  // game.js needs the nonce; webview.cspSource lets it `import './engine.js'`
  // (nonces don't carry over to imported modules).
  const csp = [
    `default-src 'none'`,
    `style-src ${webview.cspSource}`,
    `script-src 'nonce-${nonce}' ${webview.cspSource}`,
  ].join('; ');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="${styleUri}">
  <title>Tetris</title>
</head>
<body>
  <div id="app">
    <canvas id="board" width="300" height="600"></canvas>
    <div id="side">
      <h1>Tetris</h1>
      <div class="card next">
        <div class="label">Next</div>
        <canvas id="next" width="110" height="60"></canvas>
      </div>
      <dl class="card stats">
        <div><dt>Score</dt><dd id="score">0</dd></div>
        <div><dt>Level</dt><dd id="level">1</dd></div>
        <div><dt>Lines</dt><dd id="lines">0</dd></div>
      </dl>
      <button id="pause" type="button">Pause</button>
      <dl class="keys">
        <dt><kbd>&larr;</kbd> <kbd>&rarr;</kbd></dt><dd>Move</dd>
        <dt><kbd>&uarr;</kbd></dt><dd>Rotate</dd>
        <dt><kbd>&darr;</kbd></dt><dd>Soft drop</dd>
        <dt><kbd>Space</kbd></dt><dd>Hard drop</dd>
        <dt><kbd>P</kbd></dt><dd>Pause</dd>
        <dt><kbd>Enter</kbd></dt><dd>Play again</dd>
      </dl>
    </div>
  </div>
  <script type="module" nonce="${nonce}" src="${gameUri}"></script>
</body>
</html>`;
}

function getNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let nonce = '';
  for (let i = 0; i < 32; i++) {
    nonce += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return nonce;
}
