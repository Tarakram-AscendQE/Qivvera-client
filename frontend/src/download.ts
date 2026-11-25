/** Saves text as a JSON file in the viewer's browser. Nothing is uploaded or sent anywhere. */
export function downloadJson(fileName: string, body: string): void {
  const blob = new Blob([body], { type: 'application/json' }), url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
