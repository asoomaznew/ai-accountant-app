export const downloadBlob = async (blob: Blob, filename: string): Promise<void> => {
  // Check if we are running in pywebview
  const isPyWebView = (window as any).pywebview && (window as any).pywebview.api;
  
  if (isPyWebView) {
    try {
      // Convert blob to base64 string
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onloadend = () => {
          if (reader.result) {
            // result is a data URL like data:application/pdf;base64,.....
            const base64Data = (reader.result as string).split(',')[1];
            resolve(base64Data);
          } else {
            reject(new Error("Failed to read blob"));
          }
        };
        reader.onerror = reject;
      });
      reader.readAsDataURL(blob);
      const base64Data = await base64Promise;
      
      const success = await (window as any).pywebview.api.save_file(filename, base64Data);
      if (success) {
        return;
      }
      return;
    } catch (err) {
      console.error("PyWebView save failed:", err);
      // fallback
    }
  }
  
  // Standard web fallback
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  
  // Cleanup
  setTimeout(() => {
    URL.revokeObjectURL(url);
    if (document.body && document.body.contains(a)) document.body.removeChild(a);
  }, 1000);
};
