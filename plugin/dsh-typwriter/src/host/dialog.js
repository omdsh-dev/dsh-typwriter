// 原生「保存为…」对话框。
//
// 为什么需要：Texpile 的 Typst 导出（PDF/PNG/SVG）先问「存到哪」，那个入口是
// window.texpileNative.pickExportTarget；插件里没实现它，于是导出按钮一直是灰的。
// DSH 平台只提供目录选择器（directoryPicker），单文件保存要自己弹系统对话框。
//
// Windows 用 PowerShell 的 SaveFileDialog（STA 线程），macOS 用 osascript 的 choose file name，
// 其它平台返回 null —— 调用方按「不支持/取消」处理，不会假装成功。
import { spawn } from 'node:child_process';

function run(command, args, env) {
  return new Promise((resolve) => {
    let out = '';
    const child = spawn(command, args, { windowsHide: true, env: { ...process.env, ...env } });
    child.stdout?.on('data', (c) => (out += c));
    child.stderr?.on('data', (c) => (out += c));
    child.on('error', () => resolve({ code: -1, out: '' }));
    child.on('close', (code) => resolve({ code: code ?? -1, out }));
  });
}

/** 返回用户选的绝对路径；取消/不支持都返回 null */
export async function saveFileDialog({ defaultPath = '', title = '保存', extension = 'pdf', logger } = {}) {
  const ext = String(extension || 'pdf').replace(/^\./, '');
  if (process.platform === 'win32') {
    // 结果走 ENV 传，避免把路径拼进 -Command 字符串里被引号吃掉
    const script = [
      'Add-Type -AssemblyName System.Windows.Forms',
      '$d = New-Object System.Windows.Forms.SaveFileDialog',
      '$d.Title = $env:TYPWRITER_TITLE',
      '$d.FileName = $env:TYPWRITER_NAME',
      '$d.Filter = $env:TYPWRITER_FILTER',
      '$d.OverwritePrompt = $true',
      'if ($d.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { Write-Output $d.FileName }'
    ].join('; ');
    const ps = process.env.SystemRoot
      ? `${process.env.SystemRoot}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`
      : 'powershell.exe';
    const r = await run(ps, ['-NoProfile', '-NonInteractive', '-STA', '-Command', script], {
      TYPWRITER_TITLE: String(title || '保存'),
      TYPWRITER_NAME: defaultPath ? String(defaultPath).split(/[\\/]/).pop() : `export.${ext}`,
      TYPWRITER_FILTER: `${ext.toUpperCase()} (*.${ext})|*.${ext}|所有文件 (*.*)|*.*`
    });
    const picked = r.out.split(/\r?\n/).map((s) => s.trim()).filter(Boolean).pop() ?? '';
    if (r.code === 0 && picked) {
      logger?.write?.(`[dialog] saveFile -> ${picked}`);
      return picked;
    }
    logger?.write?.(`[dialog] saveFile cancelled (exit=${r.code})`);
    return null;
  }

  if (process.platform === 'darwin') {
    const name = defaultPath ? String(defaultPath).split(/[\\/]/).pop() : `export.${ext}`;
    const r = await run('osascript', [
      '-e',
      `POSIX path of (choose file name with prompt "${String(title || 'Save')}" default name "${name}")`
    ]);
    const picked = r.out.trim();
    return r.code === 0 && picked ? picked : null;
  }

  // Linux 桌面没有统一约定；导出入口保持不可用，而不是弹一个假的对话框
  logger?.write?.('[dialog] saveFile unsupported on this platform');
  return null;
}
