class AffiliateNetworksController{

    async parseXMLResponse(xmlData) {
    const parser = new xml2js.Parser({
        explicitArray: false,
        ignoreAttrs: false,
        tagNameProcessors: [xml2js.processors.stripPrefix]
    });
    
    try {
        const result = await parser.parseStringPromise(xmlData);
        return result;
    } catch (error) {
        console.error('XML parsing error:', error);
        return null;
    }
    }

    getProgramCountryCode(programName){
    let countryCode = '';
    if (programName.includes('.')) {
        countryCode = programName.split('.').pop().trim();
    } else if (programName.includes('(') && programName.includes(')')) {
        const match = programName.match(/\(([^)]+)\)/);
        if (match) {
        countryCode = match[1].trim();
        }
    }
    if(countryCode.startsWith('com'))
        return '';
    return countryCode;
    }
    getDaisyconClientID(user){
    const tokens = JSON.parse(process.env.TOKENS);
    const clientID = tokens["DAISYCON"]["USERS"][user]["ID"];
    return clientID;
    }
    async getAdPumpOffers(user){
    const tokens = JSON.parse(process.env.TOKENS);
    const api_token = tokens["ADPUMP"]["USERS"][user];
    let page = 1, pageCount = 0;
    let offers = [];
    console.log(`Sending AdPump API request to get offers...`);
    do{
        let attempts = 0;
        let getOffersResponse;
        do{
        if(attempts > 0)
            await sleep(2000);
        getOffersResponse = await sendRequest({targetUrl:`https://api.adpump.com/en/apiWmMyOffers/?key=${api_token}&format=json&page=${page}`,headers:{},body:{},method:"GET"});
        attempts ++;
        }while(("error" in getOffersResponse) && (attempts < 5));
        if(("error" in getOffersResponse) && (attempts >= 5)){
        return getOffersResponse;
        }
        const responseJson = JSON.parse(getOffersResponse.data);
        let tempOffers = [];
        pageCount = responseJson.result.pageCount || 1;
        console.log(`(page ${page}/${pageCount})...`);
        // Process 5 offers at a time
        const favouriteOffers = responseJson.result.favouriteOffers;
        for (let i = 0; i < favouriteOffers.length; i += 10) {
        const batch = favouriteOffers.slice(i, i + 10);
        
        // Process batch concurrently
        const batchResults = await Promise.all(batch.map(async (tempOffer) => {
            let trackingLinks, offerDetails;
            
            // Get tracking links (with retries)
            let getLinkAttempts = 0;
            do {
            if (getLinkAttempts > 0) await sleep(2000);
            console.log(`Getting links for offer ${tempOffer.offer.id}...`);
            const getLinksResponse = await sendRequest({
                targetUrl: `https://api.adpump.com/en/apiWmLinks/?key=${api_token}&format=json&offer=${tempOffer.offer.id}`,
                method: "GET"
            });
            
            if (!("error" in getLinksResponse)) {
                trackingLinks = JSON.parse(getLinksResponse.data);
                break;
            }
            getLinkAttempts++;
            } while (getLinkAttempts < 5);

            // Get offer details (with retries)
            let getDetailsAttempts = 0;
            do {
            if (getDetailsAttempts > 0) await sleep(2000);
            console.log(`Getting details for offer ${tempOffer.offer.id}...`);
            const getDetailsResponse = await sendRequest({
                targetUrl: `https://api.adpump.com/en/apiWmOffers/?key=${api_token}&format=json&offer=${tempOffer.offer.id}`,
                method: "GET"
            });
            
            if (!("error" in getDetailsResponse)) {
                offerDetails = JSON.parse(getDetailsResponse.data);
                break;
            }
            getDetailsAttempts++;
            } while (getDetailsAttempts < 5);

            const offerGeo = offerDetails?.result?.offers[0]?.geo;
            
            return {
            "Offer ID": tempOffer.offer.id,
            "Offer name": tempOffer.offer.name,
            "Sources": tempOffer.sources.map(source => `${source.id}:${source.name}`).join(","),
            "Tracking URL": trackingLinks?.result?.links[0]?.url || '',
            "Clean URL": trackingLinks?.result?.links[0]?.cleanUrl || '',
            excludeGeos: offerGeo ? (offerGeo.includeCountries == true ? offerGeo.excludeCountries : []) : [],
            includeGeos: offerGeo ? (offerGeo.excludeCountries == true ? offerGeo.includeCountries : []) : []
            };
        }));

        offers = [...offers, ...batchResults.filter(Boolean)];
        }
        page += 1;
    }while((page-1) < pageCount);
    return offers;
    }
    async authTradeTracker(user){
    const tokens = JSON.parse(process.env.TOKENS);
    const soapEndpoint = tokens["TRADETRACKER"]["WSDL"];
    const auth = {
        customerID: parseInt(tokens["TRADETRACKER"]["USERS"][user]["CUSTOMERID"],10),
        passphrase: tokens["TRADETRACKER"]["USERS"][user]["PASSPHRASE"]
    }
    try {
        // Create axios instance with cookie support
        axiosInstance = axios.create({
        withCredentials: true,
        headers: {
            'Content-Type': 'text/xml; charset=utf-8'
        }
        });
        
        // Step 1: Authenticate and capture cookies
        const authSoapRequest = `<?xml version="1.0" encoding="utf-8"?>
        <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" 
                    xmlns:tns="https://ws.tradetracker.com/soap/affiliate">
        <soap:Body>
            <tns:authenticate>
            <customerID>${auth.customerID}</customerID>
            <passphrase>${auth.passphrase}</passphrase>
            <sandbox>false</sandbox>
            <locale>en_GB</locale>
            <demo>false</demo>
            </tns:authenticate>
        </soap:Body>
        </soap:Envelope>`;

        console.log(`Authenticating TradeTracker user ${user}...`);
        const authResponse = await axiosInstance.post(soapEndpoint, authSoapRequest, {
        headers: {
            'SOAPAction': 'https://ws.tradetracker.com/soap/affiliate/authenticate'
        }
        });

        // Extract and store cookies from auth response
        if(!cookies["tradetracker"])
        cookies["tradetracker"] = {};
        cookies["tradetracker"][user] = authResponse.headers['set-cookie'];
    } catch (error) {
        console.error('Error:', error.response ? error.response.data : error.message);
        throw error;
    }
    }

    async getTradeTrackerOffers(user) {
    const tokens = JSON.parse(process.env.TOKENS);
    const soapEndpoint = tokens["TRADETRACKER"]["WSDL"];
    try{
        //Get affiliate sites
        const getSiteSoapRequest = `<?xml version="1.0" encoding="utf-8"?>
        <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" 
                        xmlns:tns="https://ws.tradetracker.com/soap/affiliate">
            <soap:Body>
            <tns:getAffiliateSites>
                <options xsi:nil="true"/>
            </tns:getAffiliateSites>
            </soap:Body>
        </soap:Envelope>`;
        console.log('Getting affiliate sites...');
        const sitesResponse = await axiosInstance.post(soapEndpoint, getSiteSoapRequest, {
            headers: {
            'SOAPAction': 'https://ws.tradetracker.com/soap/affiliate/getAffiliateSites',
            'Cookie': (cookies["tradetracker"][user] ? cookies["tradetracker"][user]?.join('; ') : '')
            }
        });
        const sitesParsedResponse = await parseXMLResponse(sitesResponse.data);
        
        // Extract just the data (remove SOAP envelope)
        const sitesEnvelope = sitesParsedResponse.Envelope || sitesParsedResponse['SOAP-ENV:Envelope'];
        const sitesBody = sitesEnvelope.Body || sitesEnvelope['SOAP-ENV:Body'];
        const sitesResponseData = sitesBody.getAffiliateSiteTypesResponse || sitesBody['ns1:getAffiliateSitesResponse'] || sitesBody.GetAffiliateSitesResponseMessage || sitesBody['tns:getAffiliateSitesResponse'] || sitesBody;
        
        const affiliateSites = [];
        for(let item of sitesResponseData.getAffiliateSitesResponse.affiliateSites.item){
        affiliateSites.push({"ID":item.ID["_"],"name":item.name["_"]});
        }
        
        let getCampaignsSoapRequest,campaignsParsedResponse,campaignsEnvelope,campaignsBody,campaignsResponseData;
        let campaignsAndTrackingLinks = [];
        for(let site of affiliateSites){
        // Add this to parameters if not needed: <options xsi:nil="true"/>
        getCampaignsSoapRequest = `<?xml version="1.0" encoding="utf-8"?>
            <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" 
                        xmlns:tns="https://ws.tradetracker.com/soap/affiliate">
            <soap:Body>
                <tns:getCampaigns>
                <affiliateSiteID>${site.ID}</affiliateSiteID>
                <options xsi:nil="true"/>
                </tns:getCampaigns>
            </soap:Body>
            </soap:Envelope>`;
        console.log(`Getting campaigns for affiliate site ${site.ID}...`);
        campaignsResponse = await axiosInstance.post(soapEndpoint, getCampaignsSoapRequest, {
            headers: {
            'SOAPAction': 'https://ws.tradetracker.com/soap/affiliate/getCampaigns',
            'Cookie': cookies["tradetracker"][user] ? cookies["tradetracker"][user].join('; ') : ''
            }
        });
        campaignsParsedResponse = await parseXMLResponse(campaignsResponse.data);
        
        // Extract just the data (remove SOAP envelope)
        campaignsEnvelope = campaignsParsedResponse.Envelope || campaignsParsedResponse['SOAP-ENV:Envelope'];
        campaignsBody = campaignsEnvelope.Body || campaignsEnvelope['SOAP-ENV:Body'];
        campaignsResponseData = campaignsBody.getCampaignsResponse || campaignsBody['ns1:GetCampaignsResponseMessage'] || campaignsBody.GetCampaignsResponseMessage || campaignsBody['tns:getCampaignsResponse'] || campaignsBody;
        for(const campInfo of campaignsResponseData.campaigns.item){
            campaignsAndTrackingLinks.push({
            "Affiliate site ID":site.ID || "",
            "Affiliate site name":site.name || "",
            "Campaign ID":campInfo.ID["_"] || "",
            "Campaign URL":campInfo.URL["_"] || "",
            "Tracking URL":campInfo.info.trackingURL["_"] || "",
            "Time zone":campInfo.info.timeZone["_"] || "",
            "Target group":campInfo.info.targetGroup["_"]||""
            });
        }
        }
        return {result:campaignsAndTrackingLinks};
    } catch (error) {
        console.error('Error:', error.response ? error.response.data : error.message);
        throw error;
    }
    }
    async subscribeTradeTrackerOffers(user){
    const tokens = JSON.parse(process.env.TOKENS);
    const soapEndpoint = tokens["TRADETRACKER"]["WSDL"];
    try{
        let subscribeLogs = {};
        //Get affiliate sites
        const getSiteSoapRequest = `<?xml version="1.0" encoding="utf-8"?>
        <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" 
                        xmlns:tns="https://ws.tradetracker.com/soap/affiliate">
            <soap:Body>
            <tns:getAffiliateSites>
                <options xsi:nil="true"/>
            </tns:getAffiliateSites>
            </soap:Body>
        </soap:Envelope>`;
        console.log('Getting affiliate sites...');
        const sitesResponse = await axiosInstance.post(soapEndpoint, getSiteSoapRequest, {
            headers: {
            'SOAPAction': 'https://ws.tradetracker.com/soap/affiliate/getAffiliateSites',
            'Cookie': cookies["tradetracker"][user] ? cookies["tradetracker"][user].join('; ') : ''
            }
        });
        const sitesParsedResponse = await parseXMLResponse(sitesResponse.data);
        
        // Extract just the data (remove SOAP envelope)
        const sitesEnvelope = sitesParsedResponse.Envelope || sitesParsedResponse['SOAP-ENV:Envelope'];
        const sitesBody = sitesEnvelope.Body || sitesEnvelope['SOAP-ENV:Body'];
        const sitesResponseData = sitesBody.getAffiliateSiteTypesResponse || sitesBody['ns1:getAffiliateSitesResponse'] || sitesBody.GetAffiliateSitesResponseMessage || sitesBody['tns:getAffiliateSitesResponse'] || sitesBody;
        
        const affiliateSites = [];
        for(let item of sitesResponseData.getAffiliateSitesResponse.affiliateSites.item){
        affiliateSites.push({"ID":item.ID["_"],"name":item.name["_"]});
        }
        
        let getUnsubscribedCampaignsSoapRequest,campaignsParsedResponse,campaignsEnvelope,campaignsBody,campaignsResponseData;
        let campaignsAndTrackingLinks = [];
        for(let site of affiliateSites){
        // Add this to parameters if not needed: <options xsi:nil="true"/>
        getUnsubscribedCampaignsSoapRequest = `<?xml version="1.0" encoding="utf-8"?>
            <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" 
                        xmlns:tns="https://ws.tradetracker.com/soap/affiliate">
            <soap:Body>
                <tns:getCampaigns>
                <affiliateSiteID>${site.ID}</affiliateSiteID>
                <options>
                    <assignmentStatus>notsignedup</assignmentStatus>
                </options>
                </tns:getCampaigns>
            </soap:Body>
            </soap:Envelope>`;
        console.log(`Getting unsubscribed campaigns for affiliate site ${site.ID}...`);
        campaignsResponse = await axiosInstance.post(soapEndpoint, getUnsubscribedCampaignsSoapRequest, {
            headers: {
            'SOAPAction': 'https://ws.tradetracker.com/soap/affiliate/getCampaigns',
            'Cookie': cookies["tradetracker"][user] ? cookies["tradetracker"][user].join('; ') : ''
            }
        });
        campaignsParsedResponse = await parseXMLResponse(campaignsResponse.data);
        
        // Extract just the data (remove SOAP envelope)
        campaignsEnvelope = campaignsParsedResponse.Envelope || campaignsParsedResponse['SOAP-ENV:Envelope'];
        campaignsBody = campaignsEnvelope.Body || campaignsEnvelope['SOAP-ENV:Body'];
        campaignsResponseData = campaignsBody.getCampaignsResponse || campaignsBody['ns1:GetCampaignsResponseMessage'] || campaignsBody.GetCampaignsResponseMessage || campaignsBody['tns:getCampaignsResponse'] || campaignsBody;
        let subscribeCampaignSoapRequest,subscribeResponse,subscribeParsedResponse,subscribeEnvelope,subscribeBody,subscribeResponseData;
        for(const campInfo of campaignsResponseData.campaigns.item){
            subscribeCampaignSoapRequest = `<?xml version="1.0" encoding="utf-8"?>
            <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" 
                            xmlns:tns="https://ws.tradetracker.com/soap/affiliate">
                <soap:Body>
                <tns:changeCampaignSubscription>
                    <affiliateSiteID>${site.ID}</affiliateSiteID>
                    <campaignID>${campInfo.ID["_"]}</campaignID>
                    <subscriptionAction>subscribe</subscriptionAction>
                </tns:changeCampaignSubscription>
                </soap:Body>
            </soap:Envelope>`;
            console.log(`Subscribing to campaign ${campInfo.ID["_"]}, site ${site.ID}...`);
            subscribeResponse = await axiosInstance.post(soapEndpoint, subscribeCampaignSoapRequest, {
            headers: {
                'SOAPAction': 'https://ws.tradetracker.com/soap/affiliate/changeCampaignSubscription',
                'Content-Type': 'text/xml; charset=utf-8', 
                'Cookie': cookies["tradetracker"][user] ? cookies["tradetracker"][user].join('; ') : ''
            }
            });
            subscribeParsedResponse = await parseXMLResponse(subscribeResponse.data);
            
            subscribeEnvelope = subscribeParsedResponse.Envelope || subscribeParsedResponse['SOAP-ENV:Envelope'];
            subscribeBody = subscribeEnvelope.Body || subscribeEnvelope['SOAP-ENV:Body'];
            subscribeResponseData = subscribeBody['ns1:ChangeCampaignSubscriptionResponseMessage'] || subscribeBody;
            if(!subscribeLogs[campInfo.ID["_"]])
            subscribeLogs[campInfo.ID["_"]] = [];
            subscribeLogs[campInfo.ID["_"]].push(site.ID);
            /*
            campaignsAndTrackingLinks.push({
            "Affiliate site ID":site.ID || "",
            "Affiliate site name":site.name || "",
            "Campaign ID":campInfo.ID["_"] || "",
            "Campaign URL":campInfo.URL["_"] || "",
            "Tracking URL":campInfo.info.trackingURL["_"] || "",
            "Time zone":campInfo.info.timeZone["_"] || ""
            });*/
        }
        }
        return {result:subscribeLogs};
    } catch (error) {
        console.error('Error:', error.response ? error.response.data : error.message);
        throw error;
    }
    }
    filterEclicklinkOffers(commands,offers){
    let filteredOffers = [];
    if(commands[1].geo != '' && commands[1].geo.toLowerCase() != 'all'){
        const geo = commands[1].geo.toLowerCase();
        for(crtRes of offers){
            if(crtRes["Geo"].toLowerCase() == geo || crtRes["Geo"].toLowerCase().split(",").includes(geo))
            filteredOffers.push(crtRes);
        }
    }
    else{
    filteredOffers = offers;
    }
    return filteredOffers;
    }
    async getEclicklinkOffers(commands){
    const tokens = JSON.parse(process.env.TOKENS);
    const api_token = tokens["ECLICKLINK"]["USERS"][commands[1].user];
    let page = 1, pageSize = 2000,total = 0;
    let offers = [];
    do{
        let attempts = 0;
        let getOffersResponse;
        do{
        if(attempts > 0)
            await sleep(2000);
        getOffersResponse = await sendRequest({targetUrl:`http://api.eclicklink.com/cps/affiliate/offers?page=${page}&pageSize=${pageSize}`,headers:{'apiKey':api_token},body:{},method:"GET"});
        attempts ++;
        }while(("error" in getOffersResponse) && (attempts < 5));
        if(("error" in getOffersResponse) && (attempts >= 5)){
        return getOffersResponse;
        }
        const responseJson = JSON.parse(getOffersResponse.data);
        const tempOffers = responseJson.data.records.map(resp => ({
        "Offer ID":resp.offerId,
        "Offer name":resp.offerName,
        "Preview URL":resp.previewUrl,
        "Tracking URL":resp.trackingUrl,
        "Geo":resp.geo || "",
        "Currency":resp.currencyId
        }));
        offers = [...offers,...tempOffers];
        total = responseJson.data.total;
        page += 1;
    }while((page-1)*pageSize < total);
    return offers;
    }

    async sendRequest(req){
    try{
        const { targetUrl, body, headers,method } = req;
        let response;
        if(method == 'GET'){
        response = await fetch(targetUrl, {
            method: method,
            headers: headers
        });
        }
        else if(method =="POST"){
        response = await fetch(targetUrl, {
        method: method,
        headers: headers,
        body: JSON.stringify(body)
        });
        }
        let theData = await response?.text();
        console.log(theData.slice(0,100),"...");
        let result = {data:theData,status:response.status}
        return result;
    }
    catch(error){
        console.log("Error in sendRequest: "+error.message)
        return {"error":error.message};
    }
    }
    async sendRequestDaisycon(url,headers,method,body){
    let result = []
    let page = 1, pageSize = 1000;
    let temp;
    let theUrl;
    let theBody = body;
    let nrOfAttempts = 1;
    let stopCondition;
    do{
        theUrl = url+ `page=${page}&per_page=${pageSize}`;
        console.log("Sending request: "+method+" "+theUrl);
        const {data,status} = await sendRequest({targetUrl:theUrl,body:theBody,headers:headers,method:method});
        console.log("Received status "+status);
        if(status === 204){
        break;
        }
        else if(status === 200){
        page+=1;
        temp = JSON.parse(data);
        result = result.concat(temp);
        stopCondition = (temp.length == pageSize);
        }
        else if(status === 429){
        console.log("Too many requests, retrying...");
        await sleep(10000);
        nrOfAttempts++;
        stopCondition = (nrOfAttempts < 30);
        }
        else{
        result = {status:status,errorMessage:`Daisycon API returned HTTP ${status} for URL ${theUrl} with data: ${data}`};
        break;
        }
    }
    while(stopCondition);
    return result;
    }
    async sendRequestPartnerBoost(url,headers,method,body,usePagination,isAmazonRequest,isAmazonLinkRequest){
    try{
        let result = []
        let page = 1, pageSize = 100;
        let temp;
        let theUrl = url
        let theBody = body;
        let stopCondition;
        do{
        if(usePagination){
            if(isAmazonRequest)
            theBody = {...body,page:page,page_size:pageSize};
            else
            theBody = {...body,page:page,limit:pageSize};
        }
        console.log("Sending request: "+method+" "+theUrl+", body: "+JSON.stringify(theBody));
        const {data,status} = await sendRequest({targetUrl:theUrl,body:theBody,headers:headers,method:method});
        console.log("Received status: "+status);
        if(status === 204){
            break;
        }
        else if(status === 200){
            page = page + 1;
            temp = JSON.parse(data);
            if(isAmazonLinkRequest)
            result = result.concat(temp.data);
            else result = result.concat(temp.data.list);
        }
        else{
            throw new Error(`PartnerBoost API returned HTTP ${status} for URL ${theUrl} with data: ${data}`);
        }
        if(!usePagination)
            break;
        stopCondition = (isAmazonRequest ? data.has_more : (temp.data.total > pageSize*(page-1)));
        }
        while(stopCondition);
        return result;
    }
    catch(err){
        console.log("Error in sendRequestWithPagination(): "+err.message);
    }
    }
    async exportDaisyconClientID(user,res){
    let clientID = getDaisyconClientID(user);
    if(clientID)
        res.status(200).send({ID:clientID});
    else res.status(500).send({error:"ID not found"});
    }
    filterAdPumpOffers(commands,offers){
    let filteredOffers = [];
    if(commands[1].geo != '' && commands[1].geo.toLowerCase() != 'all'){
        const geo = (commands[1].geo.toLowerCase() == "uk" ? "GB" : commands[1].geo.toUpperCase());
        for(crtRes of offers){
            if(crtRes.excludeGeos.includes(geo) || !crtRes.includeGeos.includes(geo))
            continue;
            delete crtRes.includeGeos;
            delete crtRes.excludeGeos;
            crtRes["GEO"] = geo;
            filteredOffers.push(crtRes);
        }
    }
    else{
    filteredOffers = offers;
    }
    return filteredOffers;
    }
    async exportAdPumpOffers(commands){
    return getAdPumpOffers(commands[1].user).then(result => {
        console.log('Success: exporting ad pump offers');
        return result;
    }).catch(error => {
        console.error('Failed to export adpump offers:', error);
        return [];
    });
    }
    async exportDaisyconOffers(commands){
    let media = [];
    let programs = [];
    tempMedia = await sendRequestDaisycon(commands[1].targetUrl + '?',commands[1].headers,commands[1].method,"");
    if("errorMessage" in tempMedia)
        return [];
        //res.status(tempMedia.status).send({errorMsg:tempMedia.errorMessage});
    tempMedia.forEach(med => media.push(med.id));

    programsOfMedia = {}
    for(const med of media){
        programsOfMedia[med] = [];
        tempProgram = await sendRequestDaisycon(commands[2].targetUrl + `?media_id=${med}&order_direction=asc&`,commands[2].headers,commands[2].method,"");
        if("errorMessage" in tempProgram)
        //res.status(tempProgram.status).send({errorMsg:tempProgram.errorMessage});
        return [];
        for(const aTempProgram of tempProgram){
            programsOfMedia[med].push(aTempProgram.id)
        }
        programs = programs.concat(tempProgram);
    }
    const uniquePrograms = [...new Map(programs.map(prg => [prg.id, prg])).values()];
    
    let jsonRows = [];
    let processedRows = [];
    for(const prg of uniquePrograms) {
        let subscribedMedia = Object.entries(programsOfMedia)
        .filter(([_, arr]) => arr.includes(prg.id))
        .map(([theMedia]) => theMedia);
        if(subscribedMedia.length > 0){
        for(crtMedia of subscribedMedia){
            processedRows.push({
            "Program ID":prg.id,
            "Affiliate program name": prg.name,
            "Affiliate Link": "https:"+prg.url.split("&wi")[0]+`&wi=${crtMedia}&ws=%7Bclickid%7D`,
            "GEO":getProgramCountryCode(prg.name),
            "Currency": prg.currency_code
            });
        }
        }
        else{
        processedRows.push({
            "Program ID":prg.id,
            "Affiliate program name": prg.name,
            "Affiliate Link": "https:"+prg.url.split("&wi")[0]+`&wi=&ws=%7Bclickid%7D`,
            "GEO":getProgramCountryCode(prg.name),
            "Currency": prg.currency_code
        });
        }
    }
    jsonRows.push(...processedRows);
    console.log("Exported to daisyconOffers.csv!");
    return jsonRows;
    }
    async exportPartnerBoostOffers(commands){
    console.log(commands);
    const tokens = JSON.parse(process.env.TOKENS);
    const user = commands[1]["body"]["user"];
    let access_tokens;
    if(user == 1){
        //get for all users
        access_tokens = Object.entries(tokens["PARTNERBOOST"]).map(([key, value]) => value);
    }
    else{
        access_tokens = [tokens["PARTNERBOOST"]["USERS"][user]];
    }
    let brands = [], products = [], amazonProducts = [], amazonLinks = [];
    for(access_token of access_tokens){
        // Get brands
        let req_body = {token:access_token,relationship:"Joined"}
        let tempBrands = await sendRequestPartnerBoost(commands[1]["targetUrl"],commands[1]["headers"],commands[1]["method"],req_body,true,false,false);
        brands = brands.concat(tempBrands);
        
        if(commands[1].commandName == "getProducts"){ 
        let getProductParams = [];
        let getAmazonProductParams = [];
        let tempProductList = [], tempAmazonLinksPromises = [];
        for(brd of tempBrands){
            // Get products
            getProductParams.push({token:access_token,brand_id:brd.brand_id});
            if(getProductParams.length >= 10){
            let tempProductsPromises = getProductParams.map(
                param => sendRequestPartnerBoost("https://app.partnerboost.com/api.php?mod=datafeed&op=list",commands[1]["headers"],"POST",param,true,false,false));
            let tempProducts = await Promise.all(tempProductsPromises);
            tempProducts = tempProducts.flat(1);
            products = [...products,...tempProducts];
            getProductParams = [];
            }
            // Get Amazon products
            getAmazonProductParams.push({token: access_token,default_filter: 1,brand_id: brd.brand_id});
            if(getAmazonProductParams.length >= 10){
            let tempAmazonProductsPromises = getAmazonProductParams.map(
                param => sendRequestPartnerBoost("https://app.partnerboost.com/api/datafeed/get_fba_products",commands[1]["headers"],"POST",param,true,true,false));
            let tempAmazonProducts = await Promise.all(tempAmazonProductsPromises);
            tempAmazonProducts = tempAmazonProducts.flat(1);
            amazonProducts = [...amazonProducts,...tempAmazonProducts];
            getAmazonProductParams = [];
            }
        }
        if(getProductParams.length > 0){
            let tempProductsPromises = getProductParams.map(
            param => sendRequestPartnerBoost("https://app.partnerboost.com/api.php?mod=datafeed&op=list",commands[1]["headers"],"POST",param,true,false,false));
            let tempProducts = await Promise.all(tempProductsPromises);
            tempProducts = tempProducts.flat(1);
            products = [...products,...tempProducts];
            getProductParams = [];
        }
        if(getAmazonProductParams.length > 0){
            let tempAmazonProductsPromises = getAmazonProductParams.map(
            param => sendRequestPartnerBoost("https://app.partnerboost.com/api/datafeed/get_fba_products",commands[1]["headers"],"POST",param,true,true,false));
            let tempAmazonProducts = await Promise.all(tempAmazonProductsPromises);
            tempAmazonProducts = tempAmazonProducts.flat(1);
            amazonProducts = [...amazonProducts,...tempAmazonProducts];
            getAmazonProductParams = [];
        }
        // Get amazon product links
        for(let amPrd of amazonProducts){
            tempProductList.push(amPrd);
            if(tempProductList.length > 10){
            let bodyLinksParam = tempProductList[0].product_id;
            for(tempProd of tempProductList.slice(start=1))
                bodyLinksParam += ","+tempProd.product_id;
            tempAmazonLinksPromises.push(sendRequestPartnerBoost("https://app.partnerboost.com/api/datafeed/get_fba_products_link",commands[1]["headers"],"POST",
                {token:access_token,product_ids:bodyLinksParam},
                false,false,true));
            tempProductList = [];
            }
            if(tempAmazonLinksPromises.length > 100){
            let tempAmazonLinks = await Promise.all(tempAmazonLinksPromises);
            tempAmazonLinks = tempAmazonLinks.flat(1);
            amazonLinks = [...amazonLinks,...tempAmazonLinks];
            tempAmazonLinksPromises = [];
            }
        }
        if(tempProductList.length > 0){
            let bodyLinksParam = tempProductList[0].product_id;
            for(tempProd of tempProductList.slice(start=1))
            bodyLinksParam += ","+tempProd.product_id;
            tempAmazonLinksPromises.push(sendRequestPartnerBoost("https://app.partnerboost.com/api/datafeed/get_fba_products_link",commands[1]["headers"],"POST",
                {token:access_token,product_ids:bodyLinksParam},
                false,false,true));
            tempProductList = [];
        }
        if(tempAmazonLinksPromises.length > 0){
            let tempAmazonLinks = await Promise.all(tempAmazonLinksPromises);
            tempAmazonLinks = tempAmazonLinks.flat(1);
            amazonLinks = [...amazonLinks,...tempAmazonLinks];
            tempAmazonLinksPromises = [];
        }
        }
    }
    
    let result;
    const brandRows = brands.map(brd => ({
        "Brand ID":brd.brand_id,
        "Brand name":brd.merchant_name,
        "Tracking URL": brd.tracking_url,
        "GEO": brd.country,
        "Currency": brd.currency_name
    }));
    if(commands[1].commandName == "getProducts"){
        const productRows = products.map(prd =>({
        "Brand ID":prd.brand_id,
        "Brand name":prd.brand,
        "Name":prd.name,
        "Tracking URL":prd.tracking_url,
        "Tracking short URL":prd.tracking_url_short,
        "Currency":prd.currency
        }));
        const amazonProductRows = amazonProducts.map(amPrd =>({
        "Brand ID": amPrd.brand_id,
        "Brand name": amPrd.brand_name,
        "Name":amPrd.product_name,
        "Tracking URL": amazonLinks.find(prd => prd.product_id == amPrd.product_id)?.link || "",
        "Tracking short URL":"",
        "Currency": amPrd.currency
        }));
        result = [...productRows,...amazonProductRows];
    }
    else{
        result = brandRows;
    }
    
    console.log("Exported to partnerboostOffers.csv!");
    return result;
    }
    async exportTradeTrackerOffers(commands){
    if(!cookies["tradetracker"])
        await authTradeTracker(commands[1].user);
    return getTradeTrackerOffers(commands[1].user).then(result => {
        console.log('Success:');
        return result;
    }).catch(error => {
        console.error('Failed:', error);
        return [];
    });
    }
    async exportKwankoOffers(commands){
    const {data:campaignData,status:campaignStatus} = await sendRequest({targetUrl:'https://api.kwanko.com/publishers/campaigns',body:{},headers:commands[1].headers,method:commands[1].method});
    const {data:adsData,status:adsStatus} = await sendRequest({targetUrl:commands[1].targetUrl,body:{},headers:commands[1].headers,method:commands[1].method});
    if(campaignStatus == 200 && adsStatus == 200){
        const headers = ['Domain URL','Deeplink','Media name','GEO', 'Currency'].join(',');
        let crtGeo;
        let crtCurrency;
        let jsonRows = [];  
        let campaignDataJson = JSON.parse(campaignData);
        let adsDataJson = JSON.parse(adsData);
        for(adData of adsDataJson.ads){
        crtGeo = "";
        crtCurrency = "";
        for(campaign of campaignDataJson.campaigns)
            if(campaign.id == adData.campaign.id){
            for(lang of campaign.languages){
                if(lang.includes("_"))
                crtGeo += lang.split("_")[0] + ", ";
                else if(lang.includes(" "))
                crtGeo += lang.split(" ")[0] + ", ";
                else crtGeo += lang+", ";
            }
            crtGeo = crtGeo.substring(0,crtGeo.length-2);
            crtCurrency = campaign.currency;
            }
        for(link of adData.tracked_material_per_websites){
            jsonRows.push({
            "Domain URL":adData.accepted_domains.join(","),
            "Deeplink":link.urls.click,
            "Media name": link.website_per_language.name,
            "GEO": crtGeo,
            "Currency": crtCurrency
            });
        }
        }
    console.log("Exported to kwankoOffers.csv!");
    return jsonRows;
    }
    else{
        console.log("Export failed!");
        res.status(500).send(campaignStatus+" "+adsStatus);
        return [];
    }
    }
    async exportEclicklinkOffers(commands){
    const result = await getEclicklinkOffers(commands);
    if("error" in result)
        console.error("Error exporting eclicklink offers!");
    return result;
    }
    //TODO
    async exportConvertSocialOffers(commands){
    const tokens = JSON.parse(process.env.TOKENS);
    const api_token = tokens["CONVERTSOCIAL"]["USERS"][commands[1].user];
    let page = 1, pageSize = 1000,attempts = 0;
    let offers = [];
    // Get social media account ID
    do{
        if(attempts > 0)
        await sleep(2000);
        socialMediaResponse = await sendRequest({targetUrl:`https://api.convertsocial.net/v1/public/website`,headers:commands[1].headers,body:{},method:"GET"});  
        attempts ++;
    } while(("error" in socialMediaResponse) && attempts < 5);
    socialMediaData = socialMediaResponse.data;
    // Get referral links
    for(socialMedia of socialMediaData){

    }
    }

    async updateDaisycon(commands,res){
    const publisherID = commands[1].body.publisherID;
    // Get all programs and medias
    let medias = await sendRequestDaisycon(url=`https://services.daisycon.com/publishers/${publisherID}/media?order_direction=asc&`,headers=commands[1].headers,method="GET",body={});
    let programs = await sendRequestDaisycon(url=`https://services.daisycon.com/publishers/${publisherID}/programs?&order_direction=asc&`,headers=commands[1].headers,method="GET",body={});
    if("errorMessage" in medias)
        res.status(medias.status).send({errorMsg:medias.errorMessage});
    if("errorMessage" in programs)
        res.status(programs.status).send({errorMsg:programs.errorMessage});
    // Get all programs subscribed to media and subtract them from all programs
    let programsByMedia = {};
    let updateLogs = [];
    for(med of medias){
        const medPrograms = await sendRequestDaisycon(url=`https://services.daisycon.com/publishers/${publisherID}/programs?media_id=${med.id}&order_direction=asc&`,headers=commands[1].headers,method="GET",body={});
        if(!(("errorMessage" in medPrograms) || ("error" in medPrograms))){
        let medProgramIds = medPrograms.map(medProgram => medProgram.id);
        programsByMedia[med.id]=medProgramIds;
        }
        else programsByMedia[med.id]=[];
    }
    for(let program of programs){
        let isMediaSubscribed = {};
        for(med of medias){
        prgList = programsByMedia[med.id];
        if((prgList?.length == 0) || ((prgList?.length > 0 )&& !(prgList.includes(program.id)))){
            try{
                let subscribeResult = await sendRequestDaisycon(`https://services.daisycon.com/publishers/${publisherID}/programs/${program.id}/subscriptions/${med.id}`,commands[1].headers,"POST",{});
                if(("errorMessage" in subscribeResult) && (subscribeResult.status > 300))
                updateLogs.push("Failed to subscribe program "+program.id+" to media "+med.id+": received status "+subscribeResult.status);
                else updateLogs.push("Program "+program.id+" subscribed to media "+med.id);
                await sleep(1500);
            }
            catch(err){
            console.err(err.message);
            }
        }
        }
        /*
        for(let prByMed of programsByMedia){
        isMediaSubscribed[prByMed.mediaID] = false;
        }
        for(let prByMed of programsByMedia){
        if(prByMed.programs.includes(program.id)){
            isMediaSubscribed[prByMed.mediaID] = true;
        }
        }
        for(let prByMed of programsByMedia){
        if(!isMediaSubscribed[prByMed.mediaID]){
            try{
                let subscribeResult = await sendRequestDaisycon(`https://services.daisycon.com/publishers/${publisherID}/programs/${program.id}/subscriptions/${prByMed.mediaID}`,commands[1].headers,"POST",{});
                if(("errorMessage" in subscribeResult) && (subscribeResult.status > 300))
                updateLogs.push("Failed to subscribe program "+program.id+" to media "+prByMed.mediaID+": received status "+subscribeResult.status);
                else updateLogs.push("Program "+program.id+" subscribed to media "+prByMed.mediaID);
            }
            catch(err){
            }
        }
        }*/
    }
    res.status(200).send({result:updateLogs});
    }
    async updateTradeTrackerCampaigns(commands,res){
    if(!cookies["tradetracker"] || !cookies["tradetracker"][commands[1].user])
        await authTradeTracker(commands[1].user);
    if(commands[1].commandName == "subscribeAll"){
        subscribeTradeTrackerOffers(commands[1].user).then(result => {
        console.log('Success:');
        res.status(200).send(result);
        return result;
        }).catch(error => {
        console.error('Failed:', error);
        res.status(500).send(error);
        return [];
        });
    }
    }
    async subscribeAllAdPump(user,res){
    const tokens = JSON.parse(process.env.TOKENS);
    const api_token = tokens["ADPUMP"]["USERS"][user];
    let page = 1, pageCount = 0;
    let allSubscribedOffers = [];
    do{
        let attempts = 0;
        let getOffersResponse;
        do{
        if(attempts > 0)
            await sleep(2000);
        getOffersResponse = await sendRequest({targetUrl:`https://api.adpump.com/ru/apiWmOffers/?key=${api_token}&format=json&page=${page}`,headers:{},body:{},method:"GET"});
        attempts ++;
        }while(("error" in getOffersResponse) && (attempts < 5));
        if(("error" in getOffersResponse) && (attempts >= 5)){
        return getOffersResponse;
        }
        const responseJson = JSON.parse(getOffersResponse.data);
        pageCount = responseJson.result.pageCount || 1;
        console.log(`Sending AdPump API request to get offers (page ${page}/${pageCount})...`);
        let subscribedOffers = [];
        for(let tempOffer of responseJson.result.offers){
        let subscribeAttempts = 0,subscribeResponse,subscribeResponseData;
        do{
            if(subscribeAttempts > 0)
            await sleep(2000);
            console.log(`Sending AdPump API request to subscribe for offer ${tempOffer.id}...`);
            subscribeResponse = await sendRequest({targetUrl:`https://api.adpump.com/ru/apiWmMyOffers/?key=${api_token}&format=json&act=add&offer=${tempOffer.id}`,headers:{},body:{},method:"GET"});
            subscribeAttempts ++;
        }while(("error" in getOffersResponse) && (subscribeAttempts < 5));
        if(("error" in getOffersResponse) && (subscribeAttempts >= 5)){
            trackingLinks = [];
        }
        subscribeResponseData = JSON.parse(subscribeResponse.data);
        if(subscribeResponseData.result.request?.status && (subscribeResponseData.result.request?.status?.id == 3)){
            subscribedOffers.push(subscribeResponseData.result.request.offer.id);
        }
        }
        //for getting my offers: https://api.adpump.com/ru/apiWmMyOffers/?key=VK5a1GXVXfqv17TG&format=json&page=<pagenr>
        // for subscribing: https://api.adpump.com/ru/apiWmMyOffers/?key=VK5a1GXVXfqv17TG&format=json&act=add&offer=<offer_id>
        allSubscribedOffers = [...allSubscribedOffers,...subscribedOffers];
        page += 1;
    }while((page-1) < pageCount);
    res.status(200).send({result:allSubscribedOffers});
    return allSubscribedOffers;
    }
    //TODO
    async generateAndExportEclicklinkDeeplinks(commands){
    const result = await getEclicklinkOffers(commands);
    if("error" in result){
        console.error("Error generating eclicklink deeplinks!");
        return;
    }
    const reqBody = result.map(offer => ({"offer_id":offer["Offer ID"]}))
    }
}

module.exports = new AffiliateNetworksController();