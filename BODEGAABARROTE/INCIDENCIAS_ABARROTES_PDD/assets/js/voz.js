export function iniciarDictado(target, onStatus) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    throw new Error("El reconocimiento de voz no está disponible en este navegador.");
  }

  const recognition = new SpeechRecognition();
  recognition.lang = "es-MX";
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  recognition.onstart = () => onStatus?.(true);
  recognition.onend = () => onStatus?.(false);
  recognition.onerror = () => onStatus?.(false);

  recognition.onresult = (event) => {
    const texto = event.results?.[0]?.[0]?.transcript?.trim() || "";
    if (!texto) return;

    if (target.tagName === "TEXTAREA" && target.value.trim()) {
      target.value = `${target.value.trim()} ${texto}`;
    } else {
      target.value = texto;
    }
    target.dispatchEvent(new Event("input", { bubbles: true }));
  };

  recognition.start();
  return recognition;
}
