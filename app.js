const searchInput = document.getElementById("search-input");
const searchButton = document.getElementById("search-button");
const searchStatus = document.getElementById("search-status");
const resultsElement = document.getElementById("results");

const playerSection = document.getElementById("player-section");
const videoPlayer = document.getElementById("video-player");
const videoTitle = document.getElementById("video-title");
const videoChannel = document.getElementById("video-channel");
const backButton = document.getElementById("back-button");

const searchServer = "https://dustore.ru/s.php";
const streamServer = "https://dustore.ru/stream.php";

async function init() {
    try {
        await vkBridge.send("VKWebAppInit");
    } catch (error) {
        console.error(error);
    }
}

async function searchVideos() {
    const query = searchInput.value.trim();

    if (query.length < 2) {
        searchStatus.textContent = "Введите хотя бы 2 символа";
        return;
    }

    searchStatus.textContent = "Ищем...";
    resultsElement.innerHTML = "";

    try {
        const response = await fetch(
            searchServer + "?q=" + encodeURIComponent(query)
        );

        if (!response.ok) {
            throw new Error("Search request failed");
        }

        const data = await response.json();

        if (!data.results || data.results.length === 0) {
            searchStatus.textContent = "Ничего не найдено";
            return;
        }

        searchStatus.textContent = "";

        data.results.forEach(video => {
            const element = document.createElement("div");

            element.className = "result";

            element.innerHTML = `
                <img
                    class="thumbnail"
                    src="${video.thumbnail}"
                    alt=""
                >

                <div class="result-info">
                    <div class="result-title">
                        ${escapeHtml(video.title)}
                    </div>

                    <div class="result-channel">
                        ${escapeHtml(video.channel)}
                    </div>
                </div>
            `;

            element.addEventListener("click", () => {
                playVideo(video);
            });

            resultsElement.appendChild(element);
        });

    } catch (error) {
        console.error(error);
        searchStatus.textContent = "Ошибка поиска";
    }
}

function playVideo(video) {
    const streamUrl =
        streamServer + "?id=" + encodeURIComponent(video.id);

    resultsElement.hidden = true;
    searchStatus.hidden = true;
    playerSection.hidden = false;

    videoTitle.textContent = video.title;
    videoChannel.textContent = video.channel;

    videoPlayer.src = streamUrl;
    videoPlayer.load();

    videoPlayer.play().catch(() => {});
}

function backToResults() {
    videoPlayer.pause();
    videoPlayer.removeAttribute("src");
    videoPlayer.load();

    playerSection.hidden = true;
    resultsElement.hidden = false;
    searchStatus.hidden = false;
}

function escapeHtml(value) {
    const div = document.createElement("div");
    div.textContent = value || "";
    return div.innerHTML;
}

searchButton.addEventListener("click", searchVideos);

searchInput.addEventListener("keydown", event => {
    if (event.key === "Enter") {
        searchVideos();
    }
});

backButton.addEventListener("click", backToResults);

init();