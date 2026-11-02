// Enlace predeterminado de tu modelo en Teachable Machine
const DEFAULT_URL = "https://teachablemachine.withgoogle.com/models/46qzTANPb/";
let URL = DEFAULT_URL;

let model, webcam, maxPredictions;
let webcamActive = false;
let animationFrameId = null;

// Almacenar probabilidades suavizadas para evitar parpadeos
let smoothedProbabilities = [];

// Inicializar al cargar o cambiar de modelo
async function loadModel(customUrl) {
    const targetUrl = customUrl || URL;
    const modelURL = targetUrl + "model.json";
    const metadataURL = targetUrl + "metadata.json";

    try {
        model = await tmImage.load(modelURL, metadataURL);
        maxPredictions = model.getTotalClasses();
        smoothedProbabilities = new Array(maxPredictions).fill(0);
        console.log("Modelo cargado correctamente. Clases:", maxPredictions);
        return true;
    } catch (error) {
        console.error("Error al cargar el modelo:", error);
        alert("No se pudo cargar el modelo. Verifica la ruta o el enlace de Teachable Machine.");
        return false;
    }
}

// Cargar modelo personalizado desde la interfaz
async function loadCustomModel() {
    const inputUrl = document.getElementById("model-url").value.trim();
    if (inputUrl) {
        const formattedUrl = inputUrl.endsWith("/") ? inputUrl : inputUrl + "/";
        const success = await loadModel(formattedUrl);
        if (success) {
            URL = formattedUrl;
            alert("¡Enlace de modelo actualizado con éxito!");
        }
    }
}

// Activar o desactivar la cámara web
async function toggleWebcam() {
    const placeholder = document.getElementById("placeholder-ui");
    const webcamContainer = document.getElementById("webcam-container");
    const imagePreview = document.getElementById("image-preview");
    const btnWebcam = document.getElementById("btn-webcam");
    const btnRemovePhoto = document.getElementById("btn-remove-photo");

    if (!model) {
        const loaded = await loadModel(URL);
        if (!loaded) return;
    }

    if (!webcamActive) {
        try {
            // Ocultar vista previa de imagen y botón de quitar foto si estaban activos
            imagePreview.classList.add("hidden");
            if (btnRemovePhoto) btnRemovePhoto.classList.add("hidden");

            placeholder.classList.add("hidden");
            webcamContainer.classList.remove("hidden");

            // Configuración adaptada (400x400 con modo espejo)
            webcam = new tmImage.Webcam(400, 400, true);
            await webcam.setup();
            await webcam.play();
            webcamActive = true;

            webcamContainer.replaceChildren(webcam.canvas);
            btnWebcam.innerHTML = `<i class="fa-solid fa-video-slash"></i> Detener Cámara`;
            btnWebcam.classList.replace("btn-neon-primary", "bg-rose-600");

            animationFrameId = window.requestAnimationFrame(loopWebcam);
        } catch (error) {
            console.error("Error al acceder a la cámara:", error);
            alert("No se pudo acceder a la cámara. Revisa los permisos en tu navegador o celular.");
            stopWebcam();
        }
    } else {
        stopWebcam();
    }
}

// Detener la cámara web de forma limpia sin que las barras se disparen
function stopWebcam() {
    webcamActive = false;

    if (animationFrameId) {
        window.cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }

    if (webcam) {
        try {
            webcam.stop();
        } catch (e) {
            console.warn("Cámara ya detenida:", e);
        }
    }

    const placeholder = document.getElementById("placeholder-ui");
    const webcamContainer = document.getElementById("webcam-container");
    const btnWebcam = document.getElementById("btn-webcam");

    webcamContainer.classList.add("hidden");
    webcamContainer.innerHTML = ""; // Limpia el canvas para que no procese cuadros negros
    placeholder.classList.remove("hidden");

    btnWebcam.innerHTML = `<i class="fa-solid fa-video"></i> Activar Cámara`;
    btnWebcam.classList.replace("bg-rose-600", "btn-neon-primary");

    // Restablecer las barras y el impacto sin saltos ni errores
    resetResultsState();
}

async function loopWebcam() {
    if (!webcamActive || !webcam) return;
    webcam.update();
    await predict(webcam.canvas);
    
    // Solo solicitar el siguiente frame si la cámara sigue verdaderamente activa
    if (webcamActive) {
        animationFrameId = window.requestAnimationFrame(loopWebcam);
    }
}

// Manejar la subida de una imagen estática
async function handleImageUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (webcamActive) {
        stopWebcam();
    }

    const placeholder = document.getElementById("placeholder-ui");
    const webcamContainer = document.getElementById("webcam-container");
    const imagePreview = document.getElementById("image-preview");
    const btnRemovePhoto = document.getElementById("btn-remove-photo");

    placeholder.classList.add("hidden");
    webcamContainer.classList.add("hidden");
    imagePreview.classList.remove("hidden");
    if (btnRemovePhoto) btnRemovePhoto.classList.remove("hidden");

    const reader = new FileReader();
    reader.onload = function (e) {
        imagePreview.onload = async function () {
            if (!model) {
                await loadModel(URL);
            }
            await predict(imagePreview);
        };
        imagePreview.src = e.target.result;
    };
    reader.readAsDataURL(file);

    // Permite volver a subir el mismo archivo consecutivamente
    event.target.value = "";
}

// Quitar la foto actual y restablecer el visor
function clearPhoto() {
    const placeholder = document.getElementById("placeholder-ui");
    const imagePreview = document.getElementById("image-preview");
    const btnRemovePhoto = document.getElementById("btn-remove-photo");
    const fileInput = document.getElementById("image-upload");

    imagePreview.src = "";
    imagePreview.classList.add("hidden");
    placeholder.classList.remove("hidden");

    if (btnRemovePhoto) btnRemovePhoto.classList.add("hidden");
    if (fileInput) fileInput.value = "";

    // Restablecer resultados sin saltos ni barras congeladas
    resetResultsState();
}

// Restablecer el panel de resultados y ocultar impacto sin errores
function resetResultsState() {
    if (maxPredictions) {
        smoothedProbabilities = new Array(maxPredictions).fill(0);
    } else {
        smoothedProbabilities = [];
    }

    const resultsContainer = document.getElementById("results-container");
    if (resultsContainer) {
        resultsContainer.innerHTML = `
            <p class="text-xs text-slate-400 italic text-center py-6 font-medium">
                Esperando imagen o escaneo de residuos...
            </p>
        `;
    }

    const impactCard = document.getElementById("eco-impact-card");
    if (impactCard) {
        impactCard.classList.add("hidden");
    }
}

// Predicción con suavizado exponencial
async function predict(sourceElement) {
    if (!model) return;

    const prediction = await model.predict(sourceElement);
    const resultsContainer = document.getElementById("results-container");
    const impactCard = document.getElementById("eco-impact-card");

    const alpha = webcamActive ? 0.2 : 1.0;
    let highestIndex = 0;
    let maxProb = 0;

    for (let i = 0; i < maxPredictions; i++) {
        const rawProb = prediction[i].probability * 100;
        smoothedProbabilities[i] = (alpha * rawProb) + ((1 - alpha) * (smoothedProbabilities[i] || 0));

        if (smoothedProbabilities[i] > maxProb) {
            maxProb = smoothedProbabilities[i];
            highestIndex = i;
        }
    }

    resultsContainer.replaceChildren();

    for (let i = 0; i < maxPredictions; i++) {
        const className = prediction[i].className;
        const probVal = smoothedProbabilities[i];

        const progressWrapper = document.createElement("div");
        progressWrapper.className = "space-y-1.5 p-2.5 sm:p-3 rounded-xl bg-white border border-slate-200/90 shadow-sm transition-all";

        progressWrapper.innerHTML = `
            <div class="flex justify-between items-center text-xs sm:text-sm font-semibold">
                <span class="capitalize text-slate-800 flex items-center gap-2 truncate font-bold">
                    <i class="fa-solid fa-tag text-emerald-900 text-xs sm:text-sm"></i> ${className}
                </span>
                <span class="font-mono text-amber-800 font-bold bg-amber-50 px-2 py-0.5 rounded border border-amber-300 text-xs sm:text-sm">
                    ${probVal.toFixed(1)}%
                </span>
            </div>
            <div class="w-full bg-slate-100 rounded-full h-2.5 sm:h-3 overflow-hidden border border-slate-200">
                <div class="bg-gradient-to-r from-emerald-900 via-emerald-700 to-amber-500 h-full rounded-full smooth-progress" style="width: ${probVal.toFixed(1)}%"></div>
            </div>
        `;
        resultsContainer.appendChild(progressWrapper);
    }

    const highestClass = prediction[highestIndex].className;
    if (maxProb > 70 && !highestClass.toLowerCase().includes("nada")) {
        updateEcoImpact(highestClass);
    } else if (impactCard) {
        impactCard.classList.add("hidden");
    }
}

// Información de impacto ambiental con Papel, Plástico, Vidrio, Metal y Orgánico
function updateEcoImpact(className) {
    const impactCard = document.getElementById("eco-impact-card");
    const co2Value = document.getElementById("co2-value");
    const binValue = document.getElementById("bin-value");
    const ecoTip = document.getElementById("eco-tip");

    const normalizedClass = className.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

    let data = null;
    if (normalizedClass.includes("papel") || normalizedClass.includes("carton")) {
        data = {
            co2: "-0.5 kg CO₂ eq",
            bin: "Contenedor Azul (Papel y Cartón)",
            tip: "Pliega muy bien las cajas antes de reciclarlas para optimizar el espacio en el centro de acopio."
        };
    } else if (normalizedClass.includes("plastic")) {
        data = {
            co2: "-1.2 kg CO₂ eq",
            bin: "Contenedor Amarillo (Envases y Plásticos)",
            tip: "Enjuaga ligeramente los envases plásticos antes de depositarlos para facilitar su reciclaje."
        };
    } else if (normalizedClass.includes("vidrio") || normalizedClass.includes("cristal")) {
        data = {
            co2: "-0.8 kg CO₂ eq",
            bin: "Contenedor Verde (Vidrio)",
            tip: "El vidrio es 100% reciclable y puede reutilizarse infinitamente sin perder su calidad."
        };
    } else if (normalizedClass.includes("metal") || normalizedClass.includes("lata")) {
        data = {
            co2: "-2.0 kg CO₂ eq",
            bin: "Contenedor Gris o Rojo (Metales / Latas)",
            tip: "Las latas de aluminio y acero se pueden reciclar indefinidamente ahorrando muchísima energía."
        };
    } else if (normalizedClass.includes("organic") || normalizedClass.includes("comida")) {
        data = {
            co2: "-0.9 kg CO₂ eq",
            bin: "Contenedor Marrón u Orgánicos (Compostaje)",
            tip: "Los restos de comida y jardín se transforman en un abono natural excelente para la tierra."
        };
    }

    if (data) {
        co2Value.textContent = data.co2;
        binValue.textContent = data.bin;
        ecoTip.textContent = data.tip;
        impactCard.classList.remove("hidden");
    } else if (impactCard) {
        impactCard.classList.add("hidden");
    }
}

// Cargar el modelo por defecto al iniciar la página
window.addEventListener("DOMContentLoaded", () => {
    loadModel(URL);
});
