// ====================================================
// EcoTrack - Lógica Principal (Clasificación de Residuos)
// Con soporte para doble cámara (Delantera y Trasera en móviles)
// ====================================================

// Enlace predeterminado del modelo en Teachable Machine
const DEFAULT_URL = "https://teachablemachine.withgoogle.com/models/46qzTANPb/";
let URL = DEFAULT_URL;

let model = null;
let webcam = null;
let maxPredictions = 0;
let webcamActive = false;
let animationFrameId = null;

// Control de concurrencia para evitar clics dobles o llamadas solapadas
let isStartingWebcam = false;
let isSwitchingCamera = false;

// Modo de cámara: 'environment' (trasera) o 'user' (delantera)
// En celulares iniciamos preferentemente con la cámara trasera para escanear objetos fácilmente
let currentFacingMode = "environment";

// Almacenar probabilidades suavizadas para evitar parpadeos bruscos
let smoothedProbabilities = [];

// Elementos DOM cacheados para las barras de progreso (optimización clave para celulares)
let progressElements = [];

// ----------------------------------------------------
// Carga del Modelo de Teachable Machine
// ----------------------------------------------------
async function loadModel(customUrl) {
    let targetUrl = (customUrl || URL).trim();
    if (!targetUrl.endsWith("/")) {
        targetUrl += "/";
    }

    const modelURL = targetUrl + "model.json";
    const metadataURL = targetUrl + "metadata.json";

    try {
        model = await tmImage.load(modelURL, metadataURL);
        maxPredictions = model.getTotalClasses();
        smoothedProbabilities = new Array(maxPredictions).fill(0);
        progressElements = []; // Resetear caché de elementos para nuevas clases
        console.log("Modelo cargado correctamente. Número de clases:", maxPredictions);
        return true;
    } catch (error) {
        console.error("Error al cargar el modelo:", error);
        alert("No se pudo cargar el modelo de IA. Verifica tu conexión o el enlace de Teachable Machine.");
        return false;
    }
}

// Cargar modelo personalizado ingresado por el usuario
async function loadCustomModel() {
    const inputUrl = document.getElementById("model-url").value.trim();
    if (inputUrl) {
        const formattedUrl = inputUrl.endsWith("/") ? inputUrl : inputUrl + "/";
        const success = await loadModel(formattedUrl);
        if (success) {
            URL = formattedUrl;
            alert("¡Modelo actualizado y listo para clasificar!");
            resetResultsState();
        }
    }
}

// ----------------------------------------------------
// Gestión de la Cámara Web / Celular (Delantera y Trasera)
// ----------------------------------------------------
async function toggleWebcam() {
    if (isStartingWebcam || isSwitchingCamera) return;

    if (!webcamActive) {
        await startWebcam();
    } else {
        stopWebcam();
    }
}

async function startWebcam() {
    isStartingWebcam = true;
    const placeholder = document.getElementById("placeholder-ui");
    const webcamContainer = document.getElementById("webcam-container");
    const imagePreview = document.getElementById("image-preview");
    const btnWebcam = document.getElementById("btn-webcam");
    const btnRemovePhoto = document.getElementById("btn-remove-photo");
    const btnSwitchCamera = document.getElementById("btn-switch-camera");

    btnWebcam.disabled = true;
    btnWebcam.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> <span>Iniciando cámara...</span>`;

    try {
        if (!model) {
            const loaded = await loadModel(URL);
            if (!loaded) {
                btnWebcam.disabled = false;
                btnWebcam.innerHTML = `<i class="fa-solid fa-video"></i> <span>Activar Cámara</span>`;
                isStartingWebcam = false;
                return;
            }
        }

        // Ocultar foto previa si existía
        imagePreview.classList.add("hidden");
        imagePreview.src = "";
        if (btnRemovePhoto) btnRemovePhoto.classList.add("hidden");

        placeholder.classList.add("hidden");
        webcamContainer.classList.remove("hidden");

        // En cámara delantera (user) aplicamos flip (efecto espejo).
        // En cámara trasera (environment) flip = false para que las etiquetas y marcas no salgan al revés.
        const flip = (currentFacingMode === "user");
        webcam = new tmImage.Webcam(400, 400, flip);

        try {
            await webcam.setup({ facingMode: currentFacingMode });
        } catch (constraintError) {
            console.warn("No se pudo iniciar con facingMode:", currentFacingMode, "intentando fallback...", constraintError);
            // Si el dispositivo (ej. laptop sin cámara trasera) no soporta 'environment', probar la otra o por defecto
            currentFacingMode = (currentFacingMode === "environment") ? "user" : "environment";
            webcam = new tmImage.Webcam(400, 400, currentFacingMode === "user");
            await webcam.setup();
        }

        await webcam.play();
        webcamActive = true;

        webcamContainer.innerHTML = "";
        webcamContainer.appendChild(webcam.canvas);

        btnWebcam.disabled = false;
        btnWebcam.innerHTML = `<i class="fa-solid fa-video-slash"></i> <span>Detener Cámara</span>`;
        btnWebcam.classList.remove("btn-eco-primary");
        btnWebcam.classList.add("btn-eco-danger");

        // Mostrar botón flotante para alternar cámara
        if (btnSwitchCamera) {
            btnSwitchCamera.classList.remove("hidden");
        }
        updateCameraUI();

        animationFrameId = window.requestAnimationFrame(loopWebcam);
    } catch (error) {
        console.error("Error al acceder a la cámara:", error);
        alert("No se pudo acceder a la cámara. Revisa los permisos de tu navegador o celular.");
        stopWebcam();
    } finally {
        isStartingWebcam = false;
        btnWebcam.disabled = false;
    }
}

// Detener la cámara y liberar completamente los recursos de hardware
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

        // Liberar expresamente las pistas de MediaStream para apagar la luz de la cámara en celulares/laptops
        if (webcam.webcam && webcam.webcam.srcObject) {
            try {
                const tracks = webcam.webcam.srcObject.getTracks();
                tracks.forEach(track => track.stop());
            } catch (err) {
                console.warn("Aviso al detener tracks:", err);
            }
        }
    }

    const placeholder = document.getElementById("placeholder-ui");
    const webcamContainer = document.getElementById("webcam-container");
    const btnWebcam = document.getElementById("btn-webcam");
    const btnSwitchCamera = document.getElementById("btn-switch-camera");

    webcamContainer.classList.add("hidden");
    webcamContainer.innerHTML = "";
    placeholder.classList.remove("hidden");

    if (btnSwitchCamera) {
        btnSwitchCamera.classList.add("hidden");
    }

    btnWebcam.disabled = false;
    btnWebcam.innerHTML = `<i class="fa-solid fa-video"></i> <span>Activar Cámara</span>`;
    btnWebcam.classList.remove("btn-eco-danger");
    btnWebcam.classList.add("btn-eco-primary");

    resetResultsState();
}

// Alternar entre Cámara Delantera y Trasera
async function switchCamera() {
    if (isSwitchingCamera || isStartingWebcam) return;
    isSwitchingCamera = true;

    // Cambiar preferencia
    currentFacingMode = (currentFacingMode === "environment") ? "user" : "environment";
    updateCameraUI();

    // Si la cámara está encendida, reiniciarla con el nuevo modo en caliente
    if (webcamActive) {
        const btnSwitchCamera = document.getElementById("btn-switch-camera");
        if (btnSwitchCamera) {
            btnSwitchCamera.classList.add("opacity-60", "pointer-events-none");
        }

        try {
            if (animationFrameId) {
                window.cancelAnimationFrame(animationFrameId);
                animationFrameId = null;
            }

            if (webcam) {
                try { webcam.stop(); } catch (e) {}
                if (webcam.webcam && webcam.webcam.srcObject) {
                    try {
                        webcam.webcam.srcObject.getTracks().forEach(t => t.stop());
                    } catch (e) {}
                }
            }

            const flip = (currentFacingMode === "user");
            webcam = new tmImage.Webcam(400, 400, flip);

            try {
                await webcam.setup({ facingMode: currentFacingMode });
            } catch (setupError) {
                console.warn("Fallo al cambiar a", currentFacingMode, "reintentando...", setupError);
                currentFacingMode = (currentFacingMode === "environment") ? "user" : "environment";
                updateCameraUI();
                webcam = new tmImage.Webcam(400, 400, currentFacingMode === "user");
                await webcam.setup({ facingMode: currentFacingMode });
            }

            await webcam.play();
            const webcamContainer = document.getElementById("webcam-container");
            webcamContainer.innerHTML = "";
            webcamContainer.appendChild(webcam.canvas);

            animationFrameId = window.requestAnimationFrame(loopWebcam);
        } catch (error) {
            console.error("Error al alternar cámara:", error);
            alert("No se pudo cambiar de cámara. Es posible que el dispositivo cuente con una sola cámara disponible.");
        } finally {
            if (btnSwitchCamera) {
                btnSwitchCamera.classList.remove("opacity-60", "pointer-events-none");
            }
        }
    }

    isSwitchingCamera = false;
}

// Actualizar textos e indicadores de la cámara en la interfaz
function updateCameraUI() {
    const isRear = (currentFacingMode === "environment");

    // Botón flotante
    const cameraModeText = document.getElementById("camera-mode-text");
    if (cameraModeText) {
        cameraModeText.textContent = isRear ? "Cámara Trasera" : "Cámara Frontal";
    }

    // Badge en la barra inferior
    const activeCameraBadge = document.getElementById("active-camera-badge");
    if (activeCameraBadge) {
        activeCameraBadge.textContent = isRear ? "Trasera (Residuos)" : "Frontal (Selfie)";
    }
}

// Bucle continuo de predicción con la cámara
async function loopWebcam() {
    if (!webcamActive || !webcam) return;

    try {
        webcam.update();
        if (webcam.canvas) {
            await predict(webcam.canvas);
        }
    } catch (err) {
        console.warn("Aviso en loopWebcam:", err);
    }

    if (webcamActive) {
        animationFrameId = window.requestAnimationFrame(loopWebcam);
    }
}

// ----------------------------------------------------
// Subida y Procesamiento de Fotos Estáticas
// ----------------------------------------------------
async function handleImageUpload(event) {
    const file = event.target.files && event.target.files[0];
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
            imagePreview.onload = null; // Evitar disparos repetidos
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

// Quitar la foto actual y regresar al visor limpio
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

    resetResultsState();
}

// ----------------------------------------------------
// Restablecimiento de Resultados
// ----------------------------------------------------
function resetResultsState() {
    if (maxPredictions) {
        smoothedProbabilities = new Array(maxPredictions).fill(0);
    } else {
        smoothedProbabilities = [];
    }
    progressElements = [];

    const resultsContainer = document.getElementById("results-container");
    if (resultsContainer) {
        resultsContainer.innerHTML = `
            <div class="flex flex-col items-center justify-center py-8 text-center space-y-2">
                <div class="w-10 h-10 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-200 shadow-xs">
                    <i class="fa-solid fa-magnifying-glass-chart text-sm"></i>
                </div>
                <p class="text-xs text-slate-500 font-semibold">Esperando imagen o escaneo de residuos...</p>
                <p class="text-[11px] text-slate-400">Apunta la cámara al objeto o sube una fotografía.</p>
            </div>
        `;
    }

    const impactCard = document.getElementById("eco-impact-card");
    if (impactCard) {
        impactCard.classList.add("hidden");
    }
}

// ----------------------------------------------------
// Motor de Predicción con Optimización DOM y Suavizado
// ----------------------------------------------------
async function predict(sourceElement) {
    if (!model) return;

    let prediction;
    try {
        prediction = await model.predict(sourceElement);
    } catch (err) {
        console.warn("Error en predicción:", err);
        return;
    }

    const resultsContainer = document.getElementById("results-container");
    const impactCard = document.getElementById("eco-impact-card");
    if (!resultsContainer) return;

    // Con cámara activa suavizamos las variaciones (alpha 0.25); en foto fija aplicamos el valor exacto (alpha 1.0)
    const alpha = webcamActive ? 0.25 : 1.0;
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

    // Inicializar elementos DOM si es la primera vez o si cambiaron las clases del modelo
    if (progressElements.length !== maxPredictions) {
        resultsContainer.innerHTML = "";
        progressElements = [];

        for (let i = 0; i < maxPredictions; i++) {
            const className = prediction[i].className;
            const item = document.createElement("div");
            item.className = "eco-prediction-card space-y-2 p-3 rounded-xl bg-white border border-emerald-100/90 shadow-xs transition-all";

            item.innerHTML = `
                <div class="flex justify-between items-center text-xs sm:text-sm font-semibold">
                    <span class="capitalize text-slate-800 flex items-center gap-2 truncate font-bold">
                        <i class="fa-solid fa-leaf text-emerald-600 text-xs sm:text-sm"></i>
                        <span class="class-name-label">${className}</span>
                    </span>
                    <div class="flex items-center gap-1.5">
                        <span class="winner-pill hidden text-[10px] font-black text-emerald-800 bg-emerald-100/80 px-2 py-0.5 rounded-full border border-emerald-300">
                            Detectado
                        </span>
                        <span class="prob-val-label font-mono text-emerald-950 font-extrabold bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200 text-xs sm:text-sm shadow-xs">
                            0.0%
                        </span>
                    </div>
                </div>
                <div class="w-full bg-slate-100 rounded-full h-2.5 sm:h-3 overflow-hidden border border-slate-200/80">
                    <div class="progress-bar-fill bg-gradient-to-r from-emerald-600 via-emerald-500 to-teal-400 h-full rounded-full smooth-progress" style="width: 0%"></div>
                </div>
            `;

            resultsContainer.appendChild(item);
            progressElements.push({
                card: item,
                nameLabel: item.querySelector(".class-name-label"),
                probLabel: item.querySelector(".prob-val-label"),
                barFill: item.querySelector(".progress-bar-fill"),
                winnerPill: item.querySelector(".winner-pill")
            });
        }
    }

    // Actualizar de forma ultrarrápida el contenido sin destruir ni reconstruir el DOM en cada frame
    for (let i = 0; i < maxPredictions; i++) {
        const probVal = smoothedProbabilities[i];
        const el = progressElements[i];
        if (!el) continue;

        const formattedProb = probVal.toFixed(1) + "%";
        el.probLabel.textContent = formattedProb;
        el.barFill.style.width = formattedProb;

        const isWinner = (i === highestIndex && maxProb >= 50);
        if (isWinner) {
            el.card.classList.add("border-emerald-400", "ring-2", "ring-emerald-400/40", "bg-emerald-50/20");
            el.card.classList.remove("border-emerald-100/90", "bg-white");
            el.winnerPill.classList.remove("hidden");
        } else {
            el.card.classList.remove("border-emerald-400", "ring-2", "ring-emerald-400/40", "bg-emerald-50/20");
            el.card.classList.add("border-emerald-100/90", "bg-white");
            el.winnerPill.classList.add("hidden");
        }
    }

    const highestClass = prediction[highestIndex].className;
    const lowerClass = highestClass.toLowerCase();
    const isBackground = lowerClass.includes("nada") || lowerClass.includes("fondo") || lowerClass.includes("background") || lowerClass.includes("vacio") || lowerClass.includes("empty");

    if (maxProb > 65 && !isBackground) {
        updateEcoImpact(highestClass);
    } else if (impactCard) {
        impactCard.classList.add("hidden");
    }
}

// ----------------------------------------------------
// Información de Impacto Ecológico y Clasificación
// ----------------------------------------------------
function updateEcoImpact(className) {
    const impactCard = document.getElementById("eco-impact-card");
    const co2Value = document.getElementById("co2-value");
    const binValue = document.getElementById("bin-value");
    const ecoTip = document.getElementById("eco-tip");

    if (!impactCard) return;

    // Normalizar texto quitando acentos y espacios
    const norm = className.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

    let data = null;

    if (norm.includes("papel") || norm.includes("carton") || norm.includes("paper") || norm.includes("cardboard")) {
        data = {
            co2: "-0.5 kg CO₂ eq",
            bin: "Contenedor Azul (Papel y Cartón)",
            tip: "Pliega muy bien las cajas antes de reciclarlas para optimizar el espacio en el contenedor."
        };
    } else if (norm.includes("plastic") || norm.includes("botella") || norm.includes("envase") || norm.includes("bottle") || norm.includes("pet")) {
        data = {
            co2: "-1.2 kg CO₂ eq",
            bin: "Contenedor Amarillo (Envases y Plásticos)",
            tip: "Enjuaga ligeramente los envases plásticos y aplástalos para facilitar su reciclaje."
        };
    } else if (norm.includes("vidrio") || norm.includes("cristal") || norm.includes("glass")) {
        data = {
            co2: "-0.8 kg CO₂ eq",
            bin: "Contenedor Verde (Iglú de Vidrio)",
            tip: "El vidrio es 100% reciclable en un ciclo infinito. Retira las tapas metálicas o corchos."
        };
    } else if (norm.includes("metal") || norm.includes("lata") || norm.includes("aluminio") || norm.includes("can") || norm.includes("alumnio")) {
        data = {
            co2: "-2.0 kg CO₂ eq",
            bin: "Contenedor Metales (Gris o Amarillo según tu localidad)",
            tip: "El reciclaje de latas de aluminio ahorra hasta un 95% de energía frente a la extracción primaria."
        };
    } else if (norm.includes("organic") || norm.includes("comida") || norm.includes("food") || norm.includes("biodegradable") || norm.includes("desecho") || norm.includes("fruta")) {
        data = {
            co2: "-0.9 kg CO₂ eq",
            bin: "Contenedor Marrón (Orgánicos / Compostaje)",
            tip: "Los restos orgánicos se transforman en abono natural enriquecido para nutrir los suelos."
        };
    } else if (norm.includes("pila") || norm.includes("bateria") || norm.includes("battery") || norm.includes("electron") || norm.includes("cable") || norm.includes("raee")) {
        data = {
            co2: "-3.5 kg CO₂ eq",
            bin: "Punto Limpio / Contenedor Especial de Pilas",
            tip: "Nunca tires pilas en la basura general: contienen sustancias tóxicas que contaminan miles de litros de agua."
        };
    } else {
        data = {
            co2: "-0.3 kg CO₂ eq",
            bin: "Contenedor Gris (Resto / No Reciclable)",
            tip: "Si el residuo no es reciclable, deposítalo en bolsa cerrada para una disposición segura."
        };
    }

    if (data) {
        co2Value.textContent = data.co2;
        binValue.textContent = data.bin;
        ecoTip.textContent = data.tip;
        impactCard.classList.remove("hidden");
    } else {
        impactCard.classList.add("hidden");
    }
}

// ----------------------------------------------------
// Inicialización Automática al cargar la página
// ----------------------------------------------------
window.addEventListener("DOMContentLoaded", () => {
    updateCameraUI();
    loadModel(URL);
});
