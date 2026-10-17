from dataclasses import dataclass

from app.db.misc_phrases import MISC_PHRASES


@dataclass(frozen=True)
class TopicPhraseSeed:
    id: str
    topic_id: str
    position: int
    source_ru: str
    canonical_sr: str
    targeted_skill_keys_json: tuple[str, ...]


PHRASES: dict[str, tuple[tuple[str, str], ...]] = {
    "job-interview": (
        ("Я работаю бухгалтером в небольшой компании.", "Radim kao računovođa u maloj firmi."),
        ("У меня есть три года опыта в этой области.", "Imam tri godine iskustva u ovoj oblasti."),
        ("Почему вы хотите работать в нашей компании?", "Zašto želite da radite u našoj firmi?"),
        ("Я хорошо работаю в международной команде.", "Dobro radim u međunarodnom timu."),
        ("Какие обязанности будут у нового сотрудника?", "Koje obaveze će imati novi zaposleni?"),
        ("Моя сильная сторона — спокойная работа с клиентами.", "Moja jaka strana je miran rad sa klijentima."),
        ("Я закончил экономический факультет два года назад.", "Završio sam Ekonomski fakultet pre dve godine."),
        ("Можно узнать размер начальной зарплаты?", "Mogu li da saznam kolika je početna plata?"),
        ("Я быстро учусь и люблю новые задачи.", "Brzo učim i volim nove zadatke."),
        ("Когда нужно выйти на работу?", "Kada treba da počnem da radim?"),
        ("На прошлой работе я отвечал за важные проекты.", "Na prethodnom poslu sam bio zadužen za važne projekte."),
        ("У вас есть гибкий график работы?", "Da li imate fleksibilno radno vreme?"),
        ("Я свободно говорю по-русски и немного по-сербски.", "Tečno govorim ruski i pomalo srpski."),
        ("Мне нравится находить простые решения сложных проблем.", "Volim da nalazim jednostavna rešenja za složene probleme."),
        ("С кем я буду работать каждый день?", "Sa kim ću raditi svakog dana?"),
        ("Я могу начать со следующего понедельника.", "Mogu da počnem od sledećeg ponedeljka."),
        ("В новой должности для меня важно профессиональное развитие.", "Na novom radnom mestu mi je važan profesionalni razvoj."),
        ("Как долго обычно длится испытательный срок?", "Koliko obično traje probni rad?"),
        ("Я подготовил короткое портфолио своих работ.", "Pripremio sam kratak portfolio svojih radova."),
        ("Спасибо за приятный и полезный разговор.", "Hvala vam na prijatnom i korisnom razgovoru."),
    ),
    "bank": (
        ("Я хочу открыть новый текущий счёт.", "Želim da otvorim novi tekući račun."),
        ("Какие документы нужны для открытия счёта?", "Koja dokumenta su potrebna za otvaranje računa?"),
        ("Эта банковская карта ещё не пришла.", "Ova bankovna kartica još nije stigla."),
        ("Сколько стоит ежемесячное обслуживание счёта?", "Koliko košta mesečno održavanje računa?"),
        ("Я могу снять деньги без комиссии?", "Mogu li da podignem novac bez naknade?"),
        ("Мне нужно перевести деньги на иностранный счёт.", "Treba da prebacim novac na račun u inostranstvu."),
        ("Где находится ближайший банкомат вашего банка?", "Gde se nalazi najbliži bankomat vaše banke?"),
        ("Моя карта не работает в этом магазине.", "Moja kartica ne radi u ovoj prodavnici."),
        ("Не могли бы вы проверить последнюю операцию?", "Da li biste mogli da proverite poslednju transakciju?"),
        ("Когда деньги поступят на мой счёт?", "Kada će novac stići na moj račun?"),
        ("Я забыл код от мобильного приложения.", "Zaboravio sam šifru za mobilnu aplikaciju."),
        ("У этого кредита фиксированная процентная ставка?", "Da li ovaj kredit ima fiksnu kamatnu stopu?"),
        ("Мне нужна справка о состоянии счёта.", "Potrebna mi je potvrda o stanju na računu."),
        ("Можно оплатить этот счёт через приложение?", "Mogu li da platim ovaj račun preko aplikacije?"),
        ("Я хочу изменить дневной лимит карты.", "Želim da promenim dnevni limit na kartici."),
        ("Почему с карты списали дополнительную сумму?", "Zašto je sa kartice skinut dodatni iznos?"),
        ("На какой адрес банк отправляет новые карты?", "Na koju adresu banka šalje nove kartice?"),
        ("Могу ли я получить выписку на сербском языке?", "Mogu li da dobijem izvod na srpskom jeziku?"),
        ("Мне нужно заблокировать потерянную карту.", "Moram da blokiram izgubljenu karticu."),
        ("У вас есть более выгодный пакет для иностранцев?", "Da li imate povoljniji paket za strance?"),
    ),
    "vacation": (
        ("Прошлым летом мы отдыхали на Адриатическом море.", "Prošlog leta smo se odmarali na Jadranskom moru."),
        ("В нашем маленьком отеле был красивый сад.", "U našem malom hotelu je bila lepa bašta."),
        ("Куда вы хотите поехать в следующий отпуск?", "Gde želite da putujete na sledeći odmor?"),
        ("Я предпочитаю спокойные места без большого количества туристов.", "Više volim mirna mesta bez mnogo turista."),
        ("Сколько дней вы провели в горах?", "Koliko dana ste proveli na planini?"),
        ("Мы арендовали удобную машину для поездки.", "Iznajmili smo udoban auto za putovanje."),
        ("На этом пляже можно купаться с детьми?", "Da li na ovoj plaži može da se kupa sa decom?"),
        ("Я хочу попробовать местную еду и домашнее вино.", "Želim da probam lokalnu hranu i domaće vino."),
        ("Утром мы гуляли по старому городу.", "Ujutru smo šetali po starom gradu."),
        ("Когда лучше покупать дешёвые авиабилеты?", "Kada je najbolje kupiti jeftine avionske karte?"),
        ("Нам очень понравился вид с высокой горы.", "Mnogo nam se dopao pogled sa visoke planine."),
        ("В гостинице есть свободный семейный номер?", "Da li hotel ima slobodnu porodičnu sobu?"),
        ("Я забыл тёплую куртку в автобусе.", "Zaboravio sam toplu jaknu u autobusu."),
        ("Мы вернёмся домой в воскресенье вечером.", "Vratićemo se kući u nedelju uveče."),
        ("Как добраться до ближайшего песчаного пляжа?", "Kako da stignemo do najbliže peščane plaže?"),
        ("В этом году у меня короткий зимний отпуск.", "Ove godine imam kratak zimski odmor."),
        ("Я отправил друзьям несколько красивых фотографий.", "Poslao sam prijateljima nekoliko lepih fotografija."),
        ("Можно забронировать экскурсию на завтра?", "Možemo li da rezervišemo izlet za sutra?"),
        ("Во время путешествия мы познакомились с интересными людьми.", "Tokom putovanja smo upoznali zanimljive ljude."),
        ("Следующий отпуск я хочу провести у озера.", "Sledeći odmor želim da provedem pored jezera."),
    ),
    "cafe": (
        ("Можно мне, пожалуйста, меню?", "Mogu li da dobijem jelovnik, molim vas?"),
        ("Я хотел бы заказать крепкий кофе без сахара.", "Voleo bih da naručim jaku kafu bez šećera."),
        ("У вас есть свободный столик у окна?", "Da li imate slobodan sto pored prozora?"),
        ("Что вы рекомендуете на лёгкий завтрак?", "Šta preporučujete za lagan doručak?"),
        ("Этот суп слишком солёный для меня.", "Ova supa je previše slana za mene."),
        ("Можно заменить картофель свежим салатом?", "Može li krompir da se zameni svežom salatom?"),
        ("Я не ем мясо, но ем молочные продукты.", "Ne jedem meso, ali jedem mlečne proizvode."),
        ("В этом пироге есть грецкие орехи?", "Da li u ovoj piti ima oraha?"),
        ("Мы ждём горячие напитки уже двадцать минут.", "Čekamo tople napitke već dvadeset minuta."),
        ("Принесите отдельный счёт для каждого гостя.", "Donesite poseban račun za svakog gosta."),
        ("Я возьму овощную пасту и минеральную воду.", "Uzeću testeninu sa povrćem i mineralnu vodu."),
        ("Какие свежие десерты есть сегодня?", "Koje sveže deserte imate danas?"),
        ("Можно сесть на летней террасе?", "Možemo li da sednemo na letnju terasu?"),
        ("Мне понравился ваш домашний лимонад.", "Dopala mi se vaša domaća limunada."),
        ("Уберите, пожалуйста, грязную чашку со стола.", "Sklonite prljavu šolju sa stola, molim vas."),
        ("Эта порция достаточно большая для двоих?", "Da li je ova porcija dovoljno velika za dvoje?"),
        ("Я заплачу банковской картой.", "Platiću bankovnom karticom."),
        ("Можно упаковать оставшуюся еду с собой?", "Možete li da spakujete preostalu hranu za poneti?"),
        ("Сегодня у вас очень приятная музыка.", "Danas imate veoma prijatnu muziku."),
        ("Когда кухня принимает последний заказ?", "Kada kuhinja prima poslednju porudžbinu?"),
    ),
    "work": (
        ("Сегодня у нас важная встреча с новым клиентом.", "Danas imamo važan sastanak sa novim klijentom."),
        ("Мне нужно закончить этот сложный отчёт до пятницы.", "Moram da završim ovaj složen izveštaj do petka."),
        ("Когда вы сможете обсудить новую задачу?", "Kada možete da razgovarate o novom zadatku?"),
        ("Я отправил коллегам исправленную версию документа.", "Poslao sam kolegama ispravljenu verziju dokumenta."),
        ("Мы немного опоздаем из-за утреннего транспорта.", "Malo ćemo kasniti zbog jutarnjeg prevoza."),
        ("У этого проекта слишком короткий срок.", "Rok za ovaj projekat je previše kratak."),
        ("Можете помочь мне с этой таблицей?", "Možete li da mi pomognete sa ovom tabelom?"),
        ("Я работаю из дома два дня в неделю.", "Radim od kuće dva dana nedeljno."),
        ("Наш руководитель дал команде полезный совет.", "Naš rukovodilac je dao timu koristan savet."),
        ("Во сколько начинается общее собрание?", "U koliko sati počinje zajednički sastanak?"),
        ("Я согласен с вашим практичным предложением.", "Slažem se sa vašim praktičnim predlogom."),
        ("Нам не хватает информации о старом договоре.", "Nedostaju nam informacije o starom ugovoru."),
        ("Можно перенести завтрашнюю встречу на вторую половину дня?", "Možemo li da pomerimo sutrašnji sastanak za popodne?"),
        ("После обеда я позвоню важному поставщику.", "Posle ručka ću pozvati važnog dobavljača."),
        ("Этот компьютер работает медленнее обычного.", "Ovaj računar radi sporije nego obično."),
        ("Кто отвечает за подготовку месячного отчёта?", "Ko je zadužen za pripremu mesečnog izveštaja?"),
        ("Я уже обсудил проблему с технической поддержкой.", "Već sam razgovarao o problemu sa tehničkom podrškom."),
        ("На следующей неделе мы начнём новый этап проекта.", "Sledeće nedelje ćemo početi novu fazu projekta."),
        ("Мне нравится спокойная атмосфера в нашем офисе.", "Sviđa mi se mirna atmosfera u našoj kancelariji."),
        ("Вы получили моё последнее электронное письмо?", "Da li ste dobili moj poslednji imejl?"),
    ),
    "doctor": (
        ("У меня уже два дня болит горло.", "Grlo me boli već dva dana."),
        ("Я хотел бы записаться на утренний осмотр.", "Voleo bih da zakažem jutarnji pregled."),
        ("Эта сильная боль началась вчера вечером.", "Ovaj jak bol je počeo juče uveče."),
        ("Нужно ли принимать это лекарство после еды?", "Da li ovaj lek treba da uzimam posle jela?"),
        ("У меня аллергия на некоторые антибиотики.", "Alergičan sam na neke antibiotike."),
        ("Сколько раз в день нужно пить сироп?", "Koliko puta dnevno treba da pijem sirup?"),
        ("Я чувствую слабость и лёгкое головокружение.", "Osećam slabost i blagu vrtoglavicu."),
        ("Можно получить направление к глазному врачу?", "Mogu li da dobijem uput za očnog lekara?"),
        ("У ребёнка высокая температура с утра.", "Dete ima visoku temperaturu od jutros."),
        ("Мне стало лучше после нового лечения.", "Bolje mi je posle nove terapije."),
        ("Когда будут готовы результаты анализа крови?", "Kada će biti gotovi rezultati analize krvi?"),
        ("Я не могу глубоко дышать без кашля.", "Ne mogu duboko da dišem bez kašlja."),
        ("Эта таблетка вызывает сильную сонливость?", "Da li ova tableta izaziva jaku pospanost?"),
        ("Врач посоветовал мне больше отдыхать.", "Lekar mi je savetovao da se više odmaram."),
        ("Где находится ближайшая дежурная аптека?", "Gde se nalazi najbliža dežurna apoteka?"),
        ("Мне нужен рецепт на обычное лекарство от давления.", "Potreban mi je recept za običan lek za pritisak."),
        ("У вас есть свободный термин на этой неделе?", "Da li imate slobodan termin ove nedelje?"),
        ("Я повредил левую ногу во время тренировки.", "Povredio sam levu nogu tokom treninga."),
        ("Можно мне сегодня заниматься лёгким спортом?", "Da li danas smem da se bavim lakšim sportom?"),
        ("Спасибо за подробное и понятное объяснение.", "Hvala vam na detaljnom i jasnom objašnjenju."),
    ),
    "rent": (
        ("Я ищу светлую двухкомнатную квартиру в центре.", "Tražim svetao dvosoban stan u centru."),
        ("Сколько составляет месячная арендная плата?", "Kolika je mesečna kirija?"),
        ("В стоимость входят коммунальные услуги?", "Da li su komunalije uključene u cenu?"),
        ("В маленькой ванной не работает горячая вода.", "U malom kupatilu ne radi topla voda."),
        ("Когда мастер сможет починить старую стиральную машину?", "Kada majstor može da popravi staru mašinu za veš?"),
        ("Я могу держать в квартире небольшую собаку?", "Da li mogu da držim malog psa u stanu?"),
        ("Нам нужен письменный договор на один год.", "Potreban nam je pisani ugovor na godinu dana."),
        ("Кто оплачивает срочный ремонт отопления?", "Ko plaća hitnu popravku grejanja?"),
        ("Окно в спальне плохо закрывается.", "Prozor u spavaćoj sobi se loše zatvara."),
        ("Можно посмотреть свободную квартиру завтра вечером?", "Možemo li da pogledamo slobodan stan sutra uveče?"),
        ("Залог равен двум месячным платежам.", "Depozit je jednak iznosu dve mesečne kirije."),
        ("В этом тихом доме есть лифт?", "Da li u ovoj mirnoj zgradi postoji lift?"),
        ("Я отправил хозяину фотографию сломанной двери.", "Poslao sam stanodavcu fotografiju polomljenih vrata."),
        ("Когда нужно оплатить следующую аренду?", "Kada treba da platim sledeću kiriju?"),
        ("На кухне достаточно места для большого стола.", "U kuhinji ima dovoljno mesta za veliki sto."),
        ("Соседи часто слушают громкую музыку ночью.", "Komšije često slušaju glasnu muziku noću."),
        ("Мне нравится вид с просторного балкона.", "Sviđa mi se pogled sa prostranog balkona."),
        ("Можно заменить старый холодильник новым?", "Može li stari frižider da se zameni novim?"),
        ("Я освобожу квартиру в конце следующего месяца.", "Izaći ću iz stana krajem sledećeg meseca."),
        ("У вас есть копия моего последнего платежа?", "Da li imate kopiju moje poslednje uplate?"),
    ),
    "transport": (
        ("Где находится ближайшая автобусная остановка?", "Gde se nalazi najbliža autobuska stanica?"),
        ("Я хочу купить обратный билет до Нови-Сада.", "Želim da kupim povratnu kartu do Novog Sada."),
        ("Когда отправляется следующий скорый поезд?", "Kada polazi sledeći brzi voz?"),
        ("Мне нужно сделать пересадку на центральной станции.", "Treba da presednem na glavnoj stanici."),
        ("Этот автобус идёт через старый город?", "Da li ovaj autobus ide kroz stari grad?"),
        ("Сколько времени занимает дорога до аэропорта?", "Koliko traje put do aerodroma?"),
        ("Можно оплатить билет банковской картой?", "Mogu li da platim kartu bankovnom karticom?"),
        ("Мой поезд опаздывает на двадцать минут.", "Moj voz kasni dvadeset minuta."),
        ("На какой платформе стоит ночной поезд?", "Na kom peronu stoji noćni voz?"),
        ("Мне нужен дешёвый месячный проездной.", "Potrebna mi je jeftina mesečna karta."),
        ("В этом трамвае есть место для детской коляски?", "Da li u ovom tramvaju ima mesta za dečja kolica?"),
        ("Водитель остановился перед большим мостом.", "Vozač se zaustavio ispred velikog mosta."),
        ("Какой автобус едет к новой больнице?", "Koji autobus ide do nove bolnice?"),
        ("Я забыл синий рюкзак в такси.", "Zaboravio sam plavi ranac u taksiju."),
        ("Можно вызвать свободное такси на этот адрес?", "Možete li da pozovete slobodan taksi na ovu adresu?"),
        ("Сегодня городской транспорт работает до полуночи.", "Danas gradski prevoz radi do ponoći."),
        ("Нам нужно выйти на третьей остановке.", "Treba da izađemo na trećoj stanici."),
        ("Где можно посмотреть новое расписание автобусов?", "Gde mogu da pogledam novi red vožnje autobusa?"),
        ("Эта дорога короче, но обычно более загруженная.", "Ovaj put je kraći, ali je obično prometniji."),
        ("Последний автобус уже ушёл с конечной остановки?", "Da li je poslednji autobus već krenuo sa krajnje stanice?"),
    ),
}


PHRASES["misc"] = tuple((item["source_ru"], item["canonical_sr"]) for item in MISC_PHRASES)

CASE_SKILLS = (
    "grammar.accusative",
    "grammar.genitive",
    "grammar.dative",
    "grammar.locative",
    "grammar.instrumental",
)


def phrase_seeds() -> tuple[TopicPhraseSeed, ...]:
    result: list[TopicPhraseSeed] = []
    for topic_id, phrases in PHRASES.items():
        expected_count = 50 if topic_id == "misc" else 20
        if len(phrases) != expected_count:
            raise ValueError(f"Topic {topic_id} must contain exactly {expected_count} phrases")
        for position, (source_ru, canonical_sr) in enumerate(phrases, start=1):
            form_skill = "grammar.questions" if source_ru.endswith("?") else "grammar.present"
            skills = [form_skill, CASE_SKILLS[(position - 1) % len(CASE_SKILLS)]]
            if position % 2 == 0:
                skills.append("grammar.adjective_agreement")
            result.append(
                TopicPhraseSeed(
                    id=f"{topic_id}-{position:02d}",
                    topic_id=topic_id,
                    position=position,
                    source_ru=source_ru,
                    canonical_sr=canonical_sr,
                    targeted_skill_keys_json=tuple(skills),
                )
            )
    return tuple(result)


TOPIC_PHRASES = phrase_seeds()
