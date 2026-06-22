console.log('composeEmail.js loaded');

//get user data from storage
chrome.storage.sync.get(
	[
		'userName_id',
		'userEmail_id',
		'emailOptions_id',
		'companyName_id',
		'jobTitle_id',
		'jobUrl_id',
	],
	function (data) {
        
		var username = data.userName_id || '';
		var email = data.userEmail_id || '';
		var company = data.companyName_id || 'your company';
		var jobTitle = data.jobTitle_id || '';
		var jobUrl = data.jobUrl_id || '';
		var emailOption = data.emailOptions_id || '';

		const EmailTemplates = [
			{
				option: 'referalOption_id',
				subject: `Job Referral Request`,
				body: `
            <p>Hi ${username}, hope you’re doing well.</p>
        
            <p>I'm Rishabh Chandrode, senior computer science engineering student at UIT RGPV Bhopal. I am mainly skilled in C++, JavaScript and also proficient in data structures and algorithms(<a href = "https://leetcode.com/rishabhchandrode/">Leetcode</a>). Additionally, I've honed my skills in building end-to-end web applications which include functionalities like user authentication and authorization, database interactivity, ensuring secure access to protected routes.</p>
        
            <p>In my efforts to search for a job at ${company}, I've come across a great fit for <a href = ${jobUrl} >${jobTitle}</a>. So, if you're comfortable, I'll appreciate it if you recommend me.</p>
        
            <p>Name: Rishabh Chandrode<br/>
            Email: <a href="mailto:rishabhchandrode@gmail.com">rishabhchandrode@gmail.com</a><br/>
            Portfolio: <a href="https://portfolio-rishabh-chandrodes-projects.vercel.app/">Rishabh Chandrode Portfolio</a><br/>
            LinkedIn Profile: <a href="https://www.linkedin.com/in/rishabh-chandrode/">https://www.linkedin.com/in/rishabh-chandrode/</a></p>
        
            <p>Resume: <a href="https://drive.google.com/file/d/1BR4btHC56dYJkHIFWiDUcCn3BlsnfFb8/view">https://drive.google.com/file/d/1BR4btHC56dYJkHIFWiDUcCn3BlsnfFb8/view</a></p>
            `,
			},
			{
				option: 'tohrOption_id',
				subject: `Internship at ${company}`,
				body: `
            <p>Hi ${username}, hope you’re doing well.</p>
            <p>I'm Rishabh Chandrode, senior computer science engineering student at UIT RGPV Bhopal. I am mainly skilled in C++, JavaScript and also proficient in data structures and algorithms(<a href = "https://leetcode.com/rishabhchandrode/">Leetcode</a>). Additionally, I've honed my skills in building end-to-end web applications which include functionalities like user authentication and authorization, database interactivity, ensuring secure access to protected routes.</p>
        
            <p>I am actively seeking a Software Engineering Internship/full-time opportunity. Please reach out to me if there's an opportunity available or if you could connect me with the right person, I would greatly appreciate it.</p>
        
            <p>Name: Rishabh Chandrode<br/>
            Email: <a href="mailto:rishabhchandrode@gmail.com">rishabhchandrode@gmail.com</a><br/>
            Portfolio: <a href="https://portfolio-rishabh-chandrodes-projects.vercel.app/">Rishabh Chandrode Portfolio</a><br/>
            LinkedIn Profile: <a href="https://www.linkedin.com/in/rishabh-chandrode/">https://www.linkedin.com/in/rishabh-chandrode/</a></p>
        
            <p>Resume: <a href="https://drive.google.com/file/d/1BR4btHC56dYJkHIFWiDUcCn3BlsnfFb8/view">https://drive.google.com/file/d/1BR4btHC56dYJkHIFWiDUcCn3BlsnfFb8/view</a></p>
            `,
			},
		];

		Template = EmailTemplates.find(
			(template) => template.option === emailOption,
		);

		var inputElement = document.querySelector('input.agP.aFw');
		if (inputElement) {
			inputElement.value = email;
		} else {
			console.log('no input found');
		}
		var subjectElement = document.querySelector('input.aoT');
		if (subjectElement) {
			subjectElement.value = Template.subject;
		}
		var bodyElement = document.querySelector('div.Am.Al.editable.LW-avf');
		if (bodyElement) {
			bodyElement.innerHTML = Template.body;
		}
	},
);
