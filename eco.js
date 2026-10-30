// Enlace predeterminado de tu modelo en Teachable Machine
const DEFAULT_URL = "https://teachablemachine.withgoogle.com/models/";
let URL = DEFAULT_URL;

let model, webcam, maxPredictions;
let webcamActive = false;

// Almacenar probabilidades suavizadas para evitar parpadeos en las barras
let smoothedProbabilities = [];

// Inicializar al cargar o cambiar de modelo
async function loadModel(customUrl) {
    const modelURL = (customUrl || URL) + "model.json";
    const metadataURL = (customUrl || URL) + "metadata.json";

    try {
        model = await tmImage.load(modelURL, metadataURL);
        maxPredictions = model.getTotalClasses();
        smoothedProbabilities = new Array(maxPredictions).fill(0);
        console.log("Modelo cargado correctamente. Clases:", maxPredictions);
    } catch (error) {
        console.error("Error al cargar el modelo:", error);
        alert("No se pudo cargar el modelo. Verifica la ruta o el enlace de Teachable Machine.");
    }
}

// Cargar modelo personalizado desde la interfaz
async function loadCustomModel() {
    const inputUrl = document.getElementById("model-url").value.trim();
    if (inputUrl) {
        URL = inputUrl.endsWith("/") ? inputUrl : inputUrl + "/";
        await loadModel(URL);
        alert("¡Enlace de modelo actualizado con éxito!");
    }
}

// Activar o desactivar la cámara web
async function toggleWebcam() {
    const placeholder = document.getElementById("placeholder-ui");
    const webcamContainer = document.getElementById("webcam-container");
    const imagePreview = document.getElementById("image-preview");
    const btnWebcam = document.getElementById("btn-webcam");

    if (!model) {
        await loadModel(URL);
    }

    if (!webcamActive) {
        try {
            placeholder.classList.add("hidden");
            imagePreview.classList.add("hidden");
            webcamContainer.classList.remove("hidden");

            // Cargar la cámara ajustada al contenedor
            webcam = new tmImage.Webcam(400, 400, true);
            await webcam.setup();
            await webcam.play();
            webcamActive = true;

            webcamContainer.replaceChildren(webcam.canvas);
            btnWebcam.innerHTML = `<i class="fa-solid fa-video-slash"></i> Detener Cámara`;
            btnWebcam.classList.replace("btn-neon-primary", "bg-rose-600");

            window.requestAnimationFrame(loopWebcam);
        } catch (error) {
            console.error("Error al acceder a la cámara:", error);
            alert("No se pudo acceder a la cámara. Revisa los permisos del navegador.");
        }
    } else {
        stopWebcam();
    }
}

function stopWebcam() {
    if (webcam && webcamActive) {
        webcam.stop();
        webcamActive = false;
    }
    const placeholder = document.getElementById("placeholder-ui");
    const webcamContainer = document.getElementById("webcam-container");
    const btnWebcam = document.getElementById("btn-webcam");

    webcamContainer.classList.add("hidden");
    placeholder.classList.remove("hidden");
    btnWebcam.innerHTML = `<i class="fa-solid fa-video"></i> Activar Cámara`;
    btnWebcam.classList.replace("bg-rose-600", "btn-neon-primary");
}

async function loopWebcam() {
    if (!webcamActive) return;
    webcam.update();
    await predict(webcam.canvas);
    window.requestAnimationFrame(loopWebcam);
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

    placeholder.classList.add("hidden");
    webcamContainer.classList.add("hidden");
    imagePreview.classList.remove("hidden");

    const reader = new FileReader();
    reader.onload = async function (e) {
        imagePreview.src = e.target.result;
        
        imagePreview.onload = async function () {
            if (!model) {
                await loadModel(URL);
            }
            await predict(imagePreview);
        };
    };
    reader.readAsDataURL(file);
}

// Predicción con suavizado exponencial
async function predict(sourceElement) {
    if (!model) return;

    const prediction = await model.predict(sourceElement);
    const resultsContainer = document.getElementById("results-container");

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
        progressWrapper.className = "space-y-1.5 p-2.5 rounded-xl bg-slate-900/60 border border-slate-800";

        progressWrapper.innerHTML = `
            <div class="flex justify-between items-center text-xs sm:text-sm font-semibold">
                <span class="capitalize text-slate-200 flex items-center gap-2">
                    <i class="fa-solid fa-tag text-emerald-400"></i> ${className}
                </span>
                <span class="font-mono text-emerald-400 font-bold bg-emerald-950 px-2 py-0.5 rounded border border-emerald-800/60">
                    ${probVal.toFixed(1)}%
                </span>
            </div>
            <div class="w-full bg-slate-950 rounded-full h-3 overflow-hidden border border-slate-800">
                <div class="bg-gradient-to-r from-emerald-400 via-white to-blue-500 h-full rounded-full smooth-progress" style="width: ${probVal.toFixed(1)}%"></div>
            </div>
        `;
        resultsContainer.appendChild(progressWrapper);
    }

    const highestClass = prediction[highestIndex].className;
    if (maxProb > 75 && highestClass.toLowerCase() !== "nada") {
        updateEcoImpact(highestClass);
    }
}

// Información de impacto ambiental con Papel, Plástico, Vidrio, Metal y Orgánico
function updateEcoImpact(className) {
    const impactCard = document.getElementById("eco-impact-card");
    const co2Value = document.getElementById("co2-value");
    const binValue = document.getElementById("bin-value");
    const ecoTip = document.getElementById("eco-tip");

    impactCard.classList.remove("hidden");

    const impactData = {
        "papel y carton": {
            co2: "-0.5 kg CO₂ eq",
            bin: "Contenedor Azul (Papel y Cartón)",
            tip: "Pliega muy bien las cajas antes de reciclarlas para optimizar el espacio en el centro de acopio."
        },
        "plastico": {
            co2: "-1.2 kg CO₂ eq",
            bin: "Contenedor Amarillo (Envases y Plásticos)",
            tip: "Enjuaga ligeramente los envases plásticos antes de depositarlos para facilitar su reciclaje."
        },
        "vidrio": {
            co2: "-0.8 kg CO₂ eq",
            bin: "Contenedor Verde (Vidrio)",
            tip: "El vidrio es 100% reciclable y puede reutilizarse infinitamente sin perder su calidad."
        },
        "metal": {
            co2: "-2.0 kg CO₂ eq",
            bin: "Contenedor Gris o Rojo (Metales / Latas)",
            tip: "Las latas de aluminio y acero se pueden reciclar indefinidamente ahorrando muchísima energía."
        },
        "organico": {
            co2: "-0.9 kg CO₂ eq",
            bin: "Contenedor Marrón u Orgánicos (Compostaje)",
            tip: "Los restos de comida y jardín se transforman en un abono natural excelente para la tierra."
        }
    };

    const normalizedClass = className.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    const data = impactData[normalizedClass];
    
    if (data) {
        co2Value.textContent = data.co2;
        binValue.textContent = data.bin;
        ecoTip.textContent = data.tip;
    }
}

// Cargar el modelo por defecto al iniciar la página
window.addEventListener("DOMContentLoaded", () => {
    loadModel(URL);
});