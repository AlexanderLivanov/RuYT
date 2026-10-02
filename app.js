const statusElement = document.getElementById("status");
const userInfoElement = document.getElementById("user-info");
const videoUrlElement = document.getElementById("video-url");
const downloadButton = document.getElementById("download-button");
const downloadStatus = document.getElementById("download-status");

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

    if (!url.includes("youtube.com/") && !url.includes("youtu.be/")) {
        downloadStatus.textContent = "Нужна ссылка на YouTube";
        return;
    }

    downloadStatus.textContent = "Начинаем скачивание...";

    const serverUrl = "https://dustore.ru/download.php";

    const downloadUrl =
        serverUrl + "?url=" + encodeURIComponent(url);

    window.location.href = downloadUrl;
});

init();