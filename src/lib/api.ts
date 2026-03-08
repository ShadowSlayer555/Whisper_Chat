export const fetchApi = async (url: string, options: RequestInit = {}) => {
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  if (!res.ok) {
    let errorMsg = 'An error occurred';
    try {
      const errorData = await res.json();
      errorMsg = errorData.error || errorMsg;
    } catch (e) {
      if (res.status === 413) {
        errorMsg = 'File too large. Please choose a smaller image.';
      } else {
        errorMsg = `Server error (${res.status}). Please try again later.`;
      }
    }
    throw new Error(errorMsg);
  }
  return res.json();
};
