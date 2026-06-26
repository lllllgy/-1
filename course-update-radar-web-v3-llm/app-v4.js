(function(){
  var enter=document.getElementById("enterWorkbench");
  if(enter){
    enter.addEventListener("click",function(){
      var el=document.getElementById("workbench");
      if(el){ el.scrollIntoView({behavior:"smooth",block:"start"}); }
    });
  }
  var book=document.getElementById("bookShowcase");
  if(book){
    ["mouseenter","focusin"].forEach(function(type){
      book.addEventListener(type,function(){ book.classList.add("is-active"); });
    });
    ["mouseleave","focusout"].forEach(function(type){
      book.addEventListener(type,function(){ book.classList.remove("is-active"); });
    });
  }
  var tabButtons=[].slice.call(document.querySelectorAll(".tab-btn"));
  var tabPanels=[].slice.call(document.querySelectorAll(".tab-panel"));
  tabButtons.forEach(function(button){
    button.addEventListener("click",function(){
      var key=button.getAttribute("data-tab");
      tabButtons.forEach(function(btn){ btn.classList.remove("active"); });
      tabPanels.forEach(function(panel){ panel.classList.remove("active"); });
      button.classList.add("active");
      var panel=document.querySelector('[data-panel="'+key+'"]');
      if(panel){ panel.classList.add("active"); }
    });
  });
  var revealNodes=[].slice.call(document.querySelectorAll(".reveal"));
  if("IntersectionObserver" in window){
    var observer=new IntersectionObserver(function(entries){
      entries.forEach(function(entry){
        if(entry.isIntersecting){ entry.target.classList.add("in-view"); }
      });
    },{threshold:0.12,rootMargin:"0px 0px -8% 0px"});
    revealNodes.forEach(function(node,index){
      setTimeout(function(){ node.classList.add("in-view"); observer.observe(node); }, index*60);
    });
  }else{
    revealNodes.forEach(function(node){ node.classList.add("in-view"); });
  }
})();
