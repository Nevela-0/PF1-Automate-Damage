export function onRenderChatMessage(html) {
    const messages = html[0]?.querySelectorAll('div.chat-attack');
    if (!messages?.length) return;
        messages.forEach(message=>{
        const sections = message.querySelectorAll('tr.damage > th, th.attack-damage');
        sections.forEach((section) => {
            const heal = document.createElement('div');
            heal.innerHTML = "❤️";
            const healHalf = document.createElement('div');
            healHalf.innerHTML = "🩹";
            modifyElementStyles(heal, true);
            modifyElementStyles(healHalf);
            modifyElementAttributes(heal, "Heal");
            modifyElementAttributes(healHalf, "Heal Half");
            section.appendChild(heal);
            section.appendChild(healHalf);

            message.addEventListener('mouseenter', ()=> {
                heal.style.visibility="visible";
                healHalf.style.visibility="visible";
            })
            
            message.addEventListener('mouseleave', ()=> {
                heal.style.visibility="hidden";
                healHalf.style.visibility="hidden";
            });

            const originalApplyDamage = pf1.documents.actor.ActorPF.applyDamage;
            const damage = section.querySelector('a[data-tooltip="PF1.Total')?.innerHTML?.trim();
            if (!damage) return;
            const config = { asNonLethal: false, healing: true };
            const healDamage = damage * -1;
            heal.addEventListener('click', () => { originalApplyDamage(healDamage, config) });
            healHalf.addEventListener('click', () => { originalApplyDamage(healDamage * 0.5, config) });
        });
    });
}

function modifyElementStyles (element, pulsating=false) {
    element.style.visibility="hidden";
    element.style.display="inline-block";

    if(pulsating) {
        const keyframes = [
            { transform: 'scale(1)' },
            { transform: 'scale(1.1)' },
            { transform: 'scale(1)' },
          ];
          
          const options = {
            duration: 600, 
            iterations: Infinity,
            easing: 'ease-in-out'
          };

          const animation = element.animate(keyframes, options);
          animation.pause()

          element.addEventListener('mouseenter',()=>{animation.play()});
          element.addEventListener('mouseleave',()=>{animation.pause()});

    } else {
        element.addEventListener('mouseenter',()=>{element.style.transform = 'scale(1.1)'});
        element.style.transition = "transform 150ms";
        element.addEventListener('mouseleave',()=>{element.style.transform = 'scale(1)'});
    };
};

function modifyElementAttributes (element, tooltipText) {
    element.setAttribute("data-tooltip", tooltipText);
};