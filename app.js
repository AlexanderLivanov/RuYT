const statusElement = document.getElementById("status");
const userInfoElement = document.getElementById("user-info");
const videoUrlElement = document.getElementById("video-url");
const downloadButton = document.getElementById("download-button");
const downloadStatus = document.getElementById("download-status");
const videoPlayer = document.getElementById("video-player");

async function init() {
    try {
        await vkBridge.send("VKWebAppInit");

        statusElement.textContent = "Приложение запущено";

        const user = await vkBridge.send("VKWebAppGetUserInfo");

        const firstName = user.first_name || "";
        const lastName = user.last_name || "";

        userInfoElement.textContent =
            `${firstName} ${lastName}`.trim() || "Пользователь VK";
    } catch (error) {
        console.error(error);

        statusElement.textContent = "Приложение запущено";
        userInfoElement.textContent = "Открыто вне VK";
    }
}

downloadButton.addEventListener("click", () => {
    const url = videoUrlElement.value.trim();

    if (!url) {
        downloadStatus.textContent = "Вставь ссылку на YouTube";
        return;
    }

    const match = url.match(
        /(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/
    );

    if (!match) {
        downloadStatus.textContent = "Не удалось определить видео";
        return;
    }

    const videoId = match[1];

    const streamUrl =
        "https://dustore.ru/stream.php?id=" +
        encodeURIComponent(videoId);

    downloadStatus.textContent = "Загружаем видео...";

    videoPlayer.src = streamUrl;
    videoPlayer.hidden = false;
    videoPlayer.load();

    videoPlayer.play().catch(() => {});
});

videoPlayer.addEventListener("loadeddata", () => {
    downloadStatus.textContent = "Видео готово";
});

videoPlayer.addEventListener("error", () => {
    downloadStatus.textContent = "Ошибка загрузки видео";
});

init();