const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 420, height: 420 }, deviceScaleFactor: 1 });
  await p.goto('file://' + require('path').resolve(__dirname, '../dist/index.html') + '');
  await p.waitForTimeout(500);
  await p.click('#btnSetup'); await p.waitForTimeout(200);
  await p.click('.preset >> nth=' + process.argv[2]);
  await p.click('#btnPause'); // pause, then step manually
  await p.waitForTimeout(3000); // let camera settle while paused? no: unpause briefly
  await p.click('#btnPause');
  await p.waitForTimeout(Number(process.argv[3]||4000));
  for (let i=0;i<24;i++){ await p.screenshot({ path: `s${i}.png`, clip:{x:30,y:120,width:360,height:260} }); await p.waitForTimeout(100); }
  await b.close();
})();
