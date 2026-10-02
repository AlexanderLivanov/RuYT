const statusElement = document.getElementById("status");
const userInfoElement = document.getElementById("user-info");
const actionButton = document.getElementById("action-button");

async function init() {
    try {
        await vkBridge.send("VKWebAppInit");

        statusElement.textContent = "Приложение запущено";

        const user = await vkBridge.send("VKWebAppGetUserInfo");

        const firstName = user.first_name || "";
        const lastName = user.last_name || "";

        userInfoElement.textContent = `${firstName} ${lastName}`.trim() || "Пользователь VK";
    } catch (error) {
        console.error(error);

        statusElement.textContent = "Приложение запущено";
        userInfoElement.textContent = "Открыто вне VK";
    }
}

actionButton.addEventListener("click", () => {
    statusElement.textContent = "Кнопка работает";
});

init();