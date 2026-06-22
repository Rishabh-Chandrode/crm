function extractUserName() {
    const currentUrl = window.location.href;

    let userNameElement = document.querySelector(`a[href='${currentUrl}'] h2`);

    if (!userNameElement) {
        const svgElement = document.querySelector('svg[aria-label^="View"][aria-label$="verifications"]');
        if (svgElement) {
            const siblingH2 = svgElement.parentElement.querySelector('h2');
            if (siblingH2) {
                userNameElement = siblingH2;
            }
        }
    }

    if (!userNameElement) {
        console.warn("User name element not found.");
        return null;
    }

    const userName = userNameElement.innerText.trim();
    const nameParts = userName.split(' ');
    const namePartsLength = nameParts.length;
    const firstName = nameParts[0] ?? '';
    const lastName = namePartsLength > 1 ? nameParts[namePartsLength - 1] : '';
    const middleNames = nameParts.slice(1, namePartsLength - 1).join(' ');

    return {
        firstName: firstName,
        lastName: lastName,
        middleNames: middleNames
    }
}

function getCompanyName() {
    const experienceSection = document.querySelector('section[componentkey$="ExperienceTopLevelSection"]');

    if (!experienceSection) {
        console.warn("Experience section not found.");
        return null;
    }

    const workExperienceElement = experienceSection.querySelector('div[componentkey^="entity-collection-item"]');
    
    if (!workExperienceElement) {
        console.warn("Work experience element not found.");
        return null;
    }

    const companyLogoElement = workExperienceElement.querySelector('svg');
    const ariaLabel = companyLogoElement.getAttribute('aria-label');
    const companyName = ariaLabel.split(' logo')[0].trim();
    const cleanedName = companyName.replace(/\b(pvt|ltd|limited|inc|corp)\.?/gi, "").trim();

    return cleanedName ?? '';
}

function saveUserData(userData) {
    userData.action = "getUserData";
    chrome.runtime.sendMessage(userData);
}

function scrapeUserData() {
    var user = extractUserName();
    var firstName = user.firstName ?? '';
    var lastName = user.lastName ?? '';
    var middleNames = user.middleNames ?? '';

    let company = getCompanyName();

    const currentUrl = window.location.href;
    let linkedinUrl = '';
    if (currentUrl.includes('linkedin')){
        linkedinUrl = currentUrl;
    }

    const userData = {
        firstName: firstName,
        lastName: lastName,
        middleNames: middleNames,
        email: '',
        company: company,
        linkedinUrl: linkedinUrl,
    }
    saveUserData(userData);
}
