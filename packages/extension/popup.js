
//update details from given data
function setDetails(data) {
    var firstName = data.firstName || '';
    var lastName = data.lastName || '';
    var userEmail = data.email || '';
    var companyName = data.company || '';
    var jobTitle = data.jobTitle_id || '';
    var jobUrl = data.jobUrl_id || '';
    var emailOptionsId = data.emailOptions_id || '';


    var dropdown = document.getElementById('emailOptions_id');
    if (!data.emailOptions_id || data.emailOptions_id === '') {
        var currentvalue = dropdown.options[0].id;
        console.log('current emial option' + data.emailOptions_id)
        chrome.storage.sync.set({ emailOptions_id: currentvalue }, function () {

        });
    }

    chrome.storage.sync.get('emailOptions_id', function (data) {
        var emailOptionsId = data.emailOptions_id;
        for (var i = 0; i < dropdown.options.length; i++) {
            if (dropdown.options[i].id === emailOptionsId) {
                dropdown.selectedIndex = i;
                break;
            }
        }
    });



    document.getElementById('firstName').value = firstName;
    document.getElementById('lastName').value = lastName;
    document.getElementById('email').value = userEmail;
    document.getElementById('company').value = companyName;
    document.getElementById('jobTitle_id').value = jobTitle;
    document.getElementById('jobUrl_id').value = jobUrl;
}

//set initial values
chrome.storage.sync.get(['firstName', 'lastName', 'email', 'company', 'jobTitle_id', 'jobUrl_id', 'emailOptions_id'], function (data) {
    setDetails(data);
});

//save all changes
document.querySelectorAll('input').forEach(function (input) {
    input.addEventListener('input', function (e) {
        var input = e.target;
        var key = input.id;
        var value = input.value;
        chrome.storage.sync.set({ [key]: value }, function () {
            console.log(key + ' set to ' + value);
        });
        chrome.storage.sync.get([key], function (data) {
            input.value = data[key];
        });
    });
});

function getEmailFromText(text) {
    if (!text) {
        return '';
    }

    var emailMatch = text.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
    return emailMatch ? emailMatch[0] : '';
}

document.getElementById('useCopiedTextForEmail').addEventListener('click', async function () {
    try {
        var copiedText = await navigator.clipboard.readText();
        var extractedEmail = getEmailFromText(copiedText);

        if (!extractedEmail) {
            console.warn('No email found in copied text.');
            return;
        }

        var emailInput = document.getElementById('email');
        emailInput.value = extractedEmail;
        chrome.storage.sync.set({ email: extractedEmail });
    } catch (error) {
        console.error('Could not read clipboard text.', error);
    }
});

//get user Info from linkedIn
document.getElementById('getUserInfo').addEventListener('click', function () {
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        var tabId = tabs[0].id;
        chrome.scripting
            .executeScript({
                target: { tabId: tabId },
                // Execute the scraper first so contentScript can call scrapeUserData safely.
                files: ["scrape.js", "contentScript.js"],
            });
    });
});

// listen for message from contentScript
chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
    if (message.action === 'getUserData') {
        chrome.storage.sync.set(message);
        chrome.storage.sync.get(['firstName', 'lastName', 'email', 'company', 'linkedinUrl'], function (data) {
            document.getElementById('firstName').value = data.firstName;
            document.getElementById('lastName').value = data.lastName;
            document.getElementById('email').value = data.email;
            document.getElementById('company').value = data.company;
        });
    }
});

// Handle dropdown change
var dropdown = document.getElementById('emailOptions_id')
dropdown.addEventListener('change', function () {
    var newID = dropdown.options[dropdown.selectedIndex].id;
    chrome.storage.sync.set({ emailOptions_id: newID });
    chrome.storage.sync.get('emailOptions_id', function (data) {
        var emailOptionsId = data.emailOptions_id;
        for (var i = 0; i < dropdown.options.length; i++) {
            if (dropdown.options[i].id === emailOptionsId) {
                dropdown.selectedIndex = i;
                break;
            }
        }
    });
})

//get job data
document.getElementById('getJob_id').addEventListener('click', function () {
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        var jobUrl = tabs[0].url;
        jobUrl = jobUrl.split('?')[0]; // Remove query parameters for cleaner URL
        var jobTitle = 'Software Engineer';
        chrome.storage.sync.set({ jobTitle_id: jobTitle, jobUrl_id: jobUrl });
        chrome.storage.sync.get(['jobTitle_id', 'jobUrl_id'], function (data) {
            document.getElementById('jobTitle_id').value = jobTitle;
            document.getElementById('jobUrl_id').value = jobUrl;
        });
    });
})

// Clear all user data
document.getElementById('clearAll_id').addEventListener('click', function () {
    console.log('clearAllButton clicked');
    chrome.storage.sync.clear(function () {
        setDetails({});
    });
});

// Compose email
// document.getElementById('composeEmail_id').addEventListener('click', function () {
//     chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
//         var tabId = tabs[0].id;
//         chrome.scripting
//             .executeScript({
//                 target: { tabId: tabId },
//                 files: ["composeEmail.js"],
//             });
//     });
// });


document.getElementById('addProspect').addEventListener('click', function () {
   fetchGoogleSheet('addProspect');
})

document.getElementById('scheduleEmail').addEventListener('click', () => {
    fetchGoogleSheet('scheduleEmail');
});

function fetchGoogleSheet(action) {
    const statusElement = document.getElementById('addProspectStatus');
    statusElement.innerText = '';
    let formData = new FormData();
    statusElement.innerHTML = 'sending...';
    chrome.storage.sync.get(['firstName', 'lastName', 'email', 'company', 'linkedinUrl', 'jobTitle_id', 'jobUrl_id'], function (data) {
        formData.append('action', action);
        formData.append('firstName', data.firstName || '');
        formData.append('lastName', data.lastName || '');
        formData.append('email', data.email || '');
        formData.append('company', data.company || '');
        formData.append('linkedinUrl', data.linkedinUrl || '');
        formData.append('jobTitle', data.jobTitle_id || '')
        formData.append('jobUrl', data.jobUrl_id || '')

        fetch('https://script.google.com/macros/s/AKfycbx4yEdDcadbync2slEiaSfohU3C3QxNAfaCQzHWpSFnWjika-WlJvdZq4Zz_BCkdOPk/exec', {
            method: 'POST',
            body: formData
        })
        .then(response => response.json())
        .then(data => {
            if (data.status === 'success') {
                statusElement.innerText = 'Success';
            } else if (data.status === 'error') {
                statusElement.innerText = data.message || 'Error occurred';
            }
        })
        .catch((error) => {
            console.error('Error:', error);
            statusElement.innerText = `error: ${error.message}` ;
        });

    })
}








