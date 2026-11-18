/** Runs before first paint (inline in <head>) so there is no flash of the wrong theme. */
export const THEME_SCRIPT = `(function(){try{var p=localStorage.getItem("theme");var d=p==="dark"||(p!=="light"&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.dataset.theme=d?"dark":"light";}catch(e){}})();`;
