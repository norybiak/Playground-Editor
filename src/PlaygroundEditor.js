/**
 * PlaygroundEditor
 * A tool to help create awesome playground rooms for Altspace
 * V 0.1.0
 * 
 * @Author NorybiaK
 */
 
var PlaygroundEditor = PlaygroundEditor || {};

(function(main, alt) 
{ 'use strict';

	var isInitilized = false;
	var globalEdit = false;
	
	var callback;
	
	var viewerSelect;
	
	//Altspace info
	var user = {};
	var scene= {};
	var renderer = {};
	var space = {};
	var enclosure = {};
	var masterScale = 0;
	var ppm;
	var doc = {};
	
	//Firebase references
	var baseRef = {};
	var objectsRef = {};
	var settingsRef = {};
	var userRef = {};
	var currentObjectRef = {};
	
	//User/object settings
	var preventRotate = false;
	var editMode = true;
	var selectedObject = {};
	var isUserCurrentlyEditing = false;
	var preventRotate = false;
	var editType = 0;
	
	//Tool menu 
	var toolMenu = {};
	var surface = {};
	var updateSurfacePos = true;
	var rotationSnap = 360;
	var isHidden = false;
	var isLocked = false;
	var activeEditType = 'move';
	var pressingArrow = false;
	var arrowHoldCount = 0;
	var selectedNative = '';
	var selectBox = null;
	
	//This may seem dumb and redundant (which it is at this point) but it may be useful down the road
	var arrowAxisConfig = 
	{
		rotate: { arrow1: {axis: 'x', distance: -0.01}, arrow2: {axis: 'x', distance: 0.01 }, arrow3: {axis: 'y', distance: 0.01 }, 
		          arrow4: {axis: 'y', distance: -0.01}, arrow5: {axis: 'z', distance: -0.01}, arrow6: {axis: 'z', distance: 0.01 } },
				  
		move:   { arrow1: {axis: 'x', distance: -0.01}, arrow2: {axis: 'x', distance: 0.01 }, arrow3: {axis: 'y', distance: 0.01 }, 
		          arrow4: {axis: 'y', distance: -0.01}, arrow5: {axis: 'z', distance: -0.01}, arrow6: {axis: 'z', distance: 0.01 } },
				  
		scale:  { arrow1: {axis: 'x', distance: -0.01}, arrow2: {axis: 'x', distance: 0.01 }, arrow3: {axis: 'y', distance: 0.01 }, 
		          arrow4: {axis: 'y', distance: -0.01}, arrow5: {axis: 'z', distance: -0.01}, arrow6: {axis: 'z', distance: 0.01 } },
	};

	//Rotation
	var quaternion = new THREE.Quaternion();
	var prevRotX = 0;
	var prevRotY = 0;
	var prevRotZ = 0;
	
	//Positioning
	var headVector = new THREE.Vector3();
	var hipsVector = new THREE.Vector3();
	var prevHipsVector = new THREE.Vector3();
	var objectVector = new THREE.Vector3();
	var surfaceVector = new THREE.Vector3();
	var direction = new THREE.Vector3();
	var matrix = new THREE.Matrix4();
	var staticDistance = 0;
	var distanceY = 0; 
	var prev = 0;
	
	//
	var preObjects = [];
	var objects = {};	
	
	//Colors
	var hoverColorOn = new THREE.Color('red');
	var hoverColorOff = new THREE.Color('0xffffff');
	
	//Used by web tools ... 
	var loadedObjects = {};
	var masterObjects = {};

	//Text
	var prevText = "";
	var textArray = [];
	
	//Native object stuff
	var schema = 
	{
		'n-text': 
		{
			text: '',
			fontSize: 10,//roughly a meter tall
			width: 10,//in meters
			height: 1,//in meters
			horizontalAlign: 'middle',
			verticalAlign: 'middle'
		}
	}

	/**
	 * Start the app
	 *	
	 *
	 */
	main.start = function(theScene, cb)
	{
		scene = theScene || null;
		callback = cb || false;
		
		if (scene == null)
		{
			console.log("PlaygroundEditor: a scene must be passed via start()! Exiting."); 
			return;
		}

		var promises = [alt.getUser(), alt.getSpace(), alt.getEnclosure(), alt.getDocument()];
		Promise.all(promises).then(function(values) 
		{
			user = values.shift();
			space = values.shift();
			enclosure = values.shift();
			doc = values.shift();
			ppm = enclosure.pixelsPerMeter;
			masterScale = 1;
			
			enclosure.requestFullspace();
			
			UltimateLoader.imageSize = 3.2;
				
			var doesSkeletonExist = false;
			for (var i = 0; i < scene.children.length; i++)
			{
				if (scene.children[i].type == "TrackingSkeleton")
				{	
					handleSkeleton();
					doesSkeletonExist = i;
				}
			}
			
			handleSkeleton(doesSkeletonExist);
			checkConnection();

		});
	}
	
	//i is special. It's either false or a number (as an index). We have to explicitly check if it's false because 0 returns false and i can potentially be 0.
	function handleSkeleton(i)
	{
		if (i !== false)
		{
			user.head = scene.children[i].getJoint('Head');
			user.hips = scene.children[i].getJoint('Hips');
			user.foot = scene.children[i].getJoint('Foot');	
		}
		else
		{
			alt.getThreeJSTrackingSkeleton().then(function(skeleton)
			{
				scene.add(skeleton);
				user.head = skeleton.getJoint('Head');
				user.hips = skeleton.getJoint('Hips');
				user.foot = skeleton.getJoint('Toes');
			});
		}
	}
	
	function checkConnection()
	{
		var config = { appId: "Playground-Editor", instanceId: space.sid, authorId: "NorybiaK", baseRefUrl: "playground-editor.firebaseio.com"};
		alt.utilities.sync.connect(config).then(function (connection) 
		{
			handleConnection(connection);
		});		
	}
	
	function handleConnection(connection)
	{
		var instance = connection.instance;
		baseRef = instance.child("PlaygroundEditor");
		
		objectsRef = baseRef.child('objects');
		settingsRef = baseRef.child('settings');
		userRef = connection.app.child("PlaygroundEditor").child('users').child(user.userId);
		
		finalizeStart();
	}
	
	//Helper function to finish start()
	function finalizeStart()
	{
		initFirebaseFunctions();
		if (user.isModerator || globalEdit)
		{
			initUITools();	
			docStart();
		}
		else
		{
			var UIToolsWrapper = document.getElementById("masterWrapper");
			UIToolsWrapper.innerHTML = '';
		}
		
		viewerSelect = document.getElementById('viewer-option');
		
		callback();
		
		isInitilized = true;
		console.log("PlaygroundEditor: Started!");
	}
	
	/**
	 * Select the native object. Exposed because DOM needs to access this. Can also be manually called as long as the correct params are sent in.
	 * 
	 *
	 */
	main.selectNative = function(res, type)
	{
		var path = type + '/' + res;

		var s = res.split('-');
	
		var dimensions = {w: 0.5, h: 0.5, l: 0.5};
		
		for (var i = 0; i < s.length; i++)
		{
			var regex = /\d/g;
			if (regex.test(s[i]))
			{
				switch (s[i][1])
				{
					case 'r':
						dimensions.w = parseInt(s[i][0]);
						dimensions.l = parseInt(s[i][0]);
						break;
						
					case 'd':
						dimensions.w = parseInt(s[i][0]);
						dimensions.h = parseInt(s[i][0]);
						break;
						
					case 'w':
						dimensions.w = parseInt(s[i][0]);
						break;
						
					case 'h':
						dimensions.h = parseInt(s[i][0]);
						break;

					case 'l':
						dimensions.l = parseInt(s[i][0]);
						break;							
				}	
			}
		}
		
		if (type == 'architecture' || type == 'pipes')
		{
			type = s[0];
		}
			
		selectedNative = {path: path, res: res, type: type, dimensions: dimensions};
		
		main.clearSelectBox();
		
		var useBox = false;
		switch (type)
		{
			case 'ceiling':
				dimensions.h = 0.25;
				useBox = true;
				break;
				
			case 'floor':
				dimensions.h = 0.25;
				useBox = true;
				break;
				
			case 'door':
				useBox = true;
				break;
				
			case 'pipe':
				var l = selectedNative.dimensions.l;
				dimensions.l = selectedNative.dimensions.w;
				dimensions.w = l;
				break;
							
			case 'effects':
				useBox = true;
				break;
				
			case 'objects':
				useBox = true;
				break;
		}
	
		if (useBox)
		{
			var geometry = new THREE.BoxGeometry(dimensions.l, dimensions.h, dimensions.w);
			selectBox = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({color:'#FF0000', transparent: true, opacity: 0.3}));	
			selectBox.scale.set(1, 1 , 1);
			selectBox.position.set(0,0,0);
			selectBox.visible = true;
			selectBox.userData.useBox = true;
			scene.add(selectBox);	
		}
		else
		{
			selectBox = addNativeObject('n-object');
			updateNativeObject(selectBox, 'n-object', {res: path})
			selectBox.userData.useBox = false;
			scene.add(selectBox);	
		}
		
		selectBox.addEventListener('cursorup', function (event) 
		{
			addNative();
		});
	}
	
	
    /**
	 * Removes the selectBox. Exposed because DOM needs to access this.
	 * 
	 *
	 */
	main.clearSelectBox = function()
	{
		if (selectBox !== null)
		{
			scene.remove(selectBox);
			selectBox.removeEventListener('cursorup', function (event) 
			{
				addNative();
			});
		}	
	}

	
    /**
	 * Used by the selectBox in a cursorup event. This will call and add the native object to the scene.
	 * 
	 *
	 */
	function addNative()
	{
		var name = selectedNative.res + '-' + (Math.random() + 1).toString(36).substring(7);
		//If the object exists, return, it's already available
		if (objects[name]) { console.log("PlaygroundEditor: Object - " + name + " - already exists! Skipping this object..."); return; }
		
		var pos = selectBox.position;
		
		if (selectBox.userData.useBox)
		{
			var box = new THREE.Box3().setFromObject( selectBox );
		
			switch (selectedNative.type)
			{
				case 'ceiling':
						pos = {x: box.max.x, y: box.max.y, z: box.min.z};
					break;
					
				case 'floor':
						pos = {x: box.max.x, y: box.max.y, z: box.min.z};
					break;
					
				case 'pipe':
						pos = {x: (box.max.x + box.min.x) / 2 , y: (box.max.y + box.min.y) / 2, z: box.max.z};
					break;
				
				default:
					pos = {x: box.min.x, y: box.min.y, z: box.min.z}
					break;	
					
					
				case 'effects':
					pos = {x: (box.max.x + box.min.x) / 2, y: box.min.y, z: (box.max.z + box.min.z) / 2};
					break;
					
				case 'objects':
					pos = {x: (box.max.x + box.min.x) / 2, y: box.min.y, z: (box.max.z + box.min.z) / 2};
					break;
			}
		}

		objectsRef.child(name).set({ baseRef: "", objRef: selectedNative.path, extension: "", pos: pos, rot: {x: 0, y: 0, z: 0, w: 1}, rotEdit: {x: 1, y: 1, z: 1}, scale: {x: 1, y: 1, z: 1}, settings: {locked: false}, objStatus: "new"});
	}

	/**
	 * Set the object position in Firebase
	 * 
	 *
	 */
	main.setPosition = function(objectName, pos)
	{
		if (!isInitilized) { console.log(notInitilizedException("setPosition")); return; }
		
		var posRef = currentObjectRef.child("pos");
		posRef.set({x: pos.x, y: pos.y, z: pos.z});
	}
	
	/**
	 * Set the object rotation in Firebase
	 * 
	 *
	 */
	main.setRotation = function(objectName)
	{
		if (!isInitilized) { console.log(notInitilizedException("setRotation")); return; }
		
		var rotRef = currentObjectRef.child("rot");
		objects[objectName].obj.getWorldQuaternion(quaternion);
		rotRef.set({ x: quaternion.x, y: quaternion.y, z: quaternion.z, w: quaternion.w });
	}

	/**
	 * Update Firebase with the current position of entities.
	 * This should always be called within the animation loop
	 *
	 *
	 *	All these variables! Todo: consolidate and get rid of anything that isn't necessary 
	 */
	main.update = function(timestamp)
	{
		if ((user.isModerator || globalEdit))
		{
			headVector.setFromMatrixPosition(user.head.matrixWorld);
		
			user.head.getWorldDirection(direction);
			
			hipsVector.setFromMatrixPosition(user.hips.matrixWorld);
			surfaceVector.setFromMatrixPosition(surface.matrixWorld);
			
			if (updateSurfacePos)
			{
				//UI tools position update stuff
				var distance = surfaceVector.distanceTo(hipsVector);
				if (distance > (1))
				{
					surface.lookAt(hipsVector);
					surface.rotateY(-90 * Math.PI / 180);
					surface.rotateZ(45 * Math.PI / 180);
				}

				if (distance > (4))
				{
					hipsVector.x = hipsVector.x + ((3) * direction.x); 
					hipsVector.z = hipsVector.z + ((3) * direction.z);
		
					surface.position.copy(hipsVector);
				}
			}
			
			if (isUserCurrentlyEditing)
			{
				var pos = {};
				
				objectVector.setFromMatrixPosition(selectedObject.obj.matrixWorld);
				
				distanceY = headVector.distanceTo(objectVector); 

				//Edit types
				// 0 = XZ
				// 1 = Y
				// 2 = XYZ
				if (editType == 0)
				{
					pos.x = headVector.x + (staticDistance * direction.x);
					pos.y = objectVector.y;
					pos.z = headVector.z + (staticDistance * direction.z);
					
				}
				else if (editType == 1)
				{
					pos.x = objectVector.x;
					pos.y = headVector.y + (distanceY * (direction.y - 0.15));
					pos.z = objectVector.z;
					
				}
				else if (editType == 2)
				{
					pos.x = headVector.x + (staticDistance * direction.x);
					pos.y = headVector.y + (staticDistance * (direction.y - 0.15));
					pos.z = headVector.z + (staticDistance * direction.z);
				}
				
				pos.x = Math.round(pos.x*2)/2;
				pos.y = Math.round(pos.y*2)/2;
				pos.z = Math.round(pos.z*2)/2;
				
				document.getElementById("posx").value = pos.x;
				document.getElementById("posy").value = pos.y;
				document.getElementById("posz").value = pos.z;
				
				if ((pos.y + selectedObject.boundingBox.min.y) < 0)
				{
					pos.y = 0;
				}

				selectedObject.obj.position.set(pos.x, pos.y, pos.z);
				PlaygroundEditor.setPosition( selectedObject.name, pos);
			}
			
			if (pressingArrow)
			{
				if (arrowHoldCount == 0) arrowHoldCount = timestamp;
				
				var holdTime = timestamp - arrowHoldCount;
				if (holdTime >= 1000)
				{
					arrowPress();
				}
			}
			
			if (selectBox !== null)
			{
				var pos = {};
				
				var snap = 2;
				var distance = 5;
				var floor = 0;
				switch (selectedNative.type)
				{
					case 'ceiling':
							snap = 4;
						break;
						
					case 'floor':
							snap = 4;
						break;
						
					case 'effects':
						distance = 2;
						break;
					
					case 'objects':
						distance = 2;
						break;
					
					case 'pipe':
						floor = 0.5;
					
				}
				
				pos.x = headVector.x + (distance * direction.x);
				pos.y = headVector.y + (distance * direction.y);
				pos.z = headVector.z + (distance * direction.z);
					
				pos.x = Math.round(pos.x * 2) / 2;
				pos.y = Math.round(pos.y * snap) / snap;
				pos.z = Math.round(pos.z * 2) / 2;
				
				if (pos.y < floor)
				{
					pos.y = floor;
				}
				
				selectBox.position.set(pos.x, pos.y, pos.z);
				
				selectedNative.pos = pos;
			}
		}
	}
	
	/**
	 * Grab the object position from Firebase
	 * 
	 *
	 */
	main.getPosition = function(object)
	{
		if (!isInitilized) { console.log(notInitilizedException("getPosition")); return; }
				
		var pos;
		currentObjectRef.once("value", function(data) { pos = data.val(); });
		
		return pos;
	}
	
	/**
	 * Grab the object rotation from Firebase
	 * 
	 *
	 */
	main.getRotation = function(object)
	{
		if (!isInitilized) { console.log(notInitilizedException("getRotation")); return; }
		
		
		var rot;
		currentObjectRef.once("value", function(data) { rot = data.val(); });
		
		return rot;
	}
	
	/**
	 * Check if the user is editing an object (moving)
	 * 
	 *
	 */
	main.isUserCurrentlyEditing = function()
	{
		if (!isInitilized) { console.log(notInitilizedException("isUserCurrentlyEditing")); return; }
		
		return isUserCurrentlyEditing;
	}
	
	/**
	 * Get the current object being edited
	 * 
	 *
	 */
	main.currentObjectBeingEdited = function()
	{
		if (!isInitilized) { console.log(notInitilizedException("isUserCurrentlyEditing")); return; }
		
		return selectedObject;
	}
	
	/**
	 * Initalizes the UI tools
	 *
	 */
	function initUITools()
	{
		var geometry;
		var loader = new THREE.TextureLoader();
		loader.setCrossOrigin('anonymous');
		var url;
		var texture;
		
		geometry = new THREE.BoxGeometry(0.05, 0.3, 1);
		surface = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({color:'#9f9f9f'}));	
		surface.scale.set(1,1,1);
		scene.add(surface);	

		geometry = new THREE.BoxGeometry(0.1, 0.1, 0.3);
		var lockBtn = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({color:'#cccccc'}));	
		lockBtn.scale.set(0.5, 0.5 , 0.5);
		lockBtn.position.set(0.02,0.08,0);
		surface.add(lockBtn);
		
		geometry = new THREE.BoxGeometry(0.1, 0.1, 0.3);
		var stayBtn = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({color:'#cccccc'}));	
		stayBtn.scale.set(0.5, 0.5 , 0.5);
		stayBtn.position.set(0.02,0.08,-0.2);
		surface.add(stayBtn);	
		
		geometry = new THREE.BoxGeometry(0.1, 0.1, 0.3);
		var hideBtn = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({color:'#cccccc'}));	
		hideBtn.scale.set(0.5, 0.5 , 0.5);
		hideBtn.position.set(0.02,0.08,-0.4);
		surface.add(hideBtn);	
		
		geometry = new THREE.BoxGeometry(0.02, 0.15, 0.3);
		var openBtn = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({color:'#cccccc'}));	
		openBtn.scale.set(1, 1, 1);
		openBtn.position.set(0,-5000,5);
		openBtn.rotateY(90 * Math.PI / 180);
		openBtn.rotateZ(75 * Math.PI / 180);
		user.hips.add(openBtn);
	
		var data;
		
		data = { text: 'Moving', fontSize: 1 };
		textArray[0] = addNativeText(data);
		textArray[0].position.set(0, -0.3, 0.3);
		textArray[0].rotateY(90 * Math.PI / 180);
		surface.add(textArray[0]);
		
		data = { text: 'X,Z', fontSize: 1 };
		textArray[1] = addNativeText(data);
		textArray[1].position.set(0.026, 0.07, 0.4);
		textArray[1].rotateY(90 * Math.PI / 180);
		surface.add(textArray[1]);
		
		data = { text: 'Stay', fontSize: 1 };
		textArray[2] = addNativeText(data);
		textArray[2].position.set(0.052, 0, 0);
		textArray[2].rotateY(90 * Math.PI / 180);
		stayBtn.add(textArray[2]);
		
		data = { text: 'Hide', fontSize: 1 };
		textArray[3] = addNativeText(data);
		textArray[3].position.set(0.052, 0, 0);
		textArray[3].rotateY(90 * Math.PI / 180);
		hideBtn.add(textArray[3]);
		
		data = { text: 'Lock', fontSize: 1 };
		textArray[4] = addNativeText(data);
		textArray[4].position.set(0.052, 0, 0);
		textArray[4].rotateY(90 * Math.PI / 180);
		lockBtn.add(textArray[4]);
		
		data = { text: 'Unhide', fontSize: 1 };
		textArray[5] = addNativeText(data);
		textArray[5].position.set(0.052, 0, 0);
		textArray[5].rotateY(90 * Math.PI / 180);
		openBtn.add(textArray[5]);
			
		var moveBtn;
		url = 'http://playground-editor.s3-us-west-2.amazonaws.com/assets/images/move_map.png';
		loader.load(url, function ( texture ) 
		{
			geometry = new THREE.BoxGeometry(0.05, 0.15, 0.15);
			moveBtn = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({color:'#cccccc', map: texture}));	
			moveBtn.scale.set(1, 1 , 1);
			moveBtn.position.set(0.02,-0.06,0.4);
			surface.add(moveBtn);	
			
			moveBtn.addEventListener('cursorup', function (event) 
			{
				if (editType >= 2)
				{
					editType = 0;
				}
				else
				{
					editType++;
				}

				switch (editType)
				{
					case 0:
						updateNativeObject(textArray[1], 'n-text', { text: 'X,Z', fontSize: 1 });
						break;
						
					case 1:
						updateNativeObject(textArray[1], 'n-text', { text: 'Y', fontSize: 1 });
						break;
						
					case 2:
						updateNativeObject(textArray[1], 'n-text', { text: 'X,Y,Z', fontSize: 1 });
						break;
				}
				
				openTab(null, 'positionTab');
				
				activeEditType = 'move';
				
				updateNativeObject(textArray[0], 'n-text', { text: 'Moving', fontSize: 1 });
			});

		});

		var rotateBtn;
		url = 'http://playground-editor.s3-us-west-2.amazonaws.com/assets/images/rotate_map.png';	
		loader.load(url, function ( texture ) 
		{
			geometry = new THREE.BoxGeometry(0.05, 0.15, 0.15);
			rotateBtn = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({color:'#cccccc', map: texture}));	
			rotateBtn.scale.set(1, 1 , 1);
			rotateBtn.position.set(0.02,-0.06,0.15);
			surface.add(rotateBtn);	
			
			
			rotateBtn.addEventListener('cursorup', function (event) 
			{
				openTab(null, 'rotationTab');
				
				activeEditType = 'rotate';
				
				updateNativeObject(textArray[0], 'n-text', { text: 'Rotating', fontSize: 1 });
			});
		});
		
		var scaleBtn;
		url = 'http://playground-editor.s3-us-west-2.amazonaws.com/assets/images/scale_map.png';
		loader.load(url, function ( texture ) 
		{
			geometry = new THREE.BoxGeometry(0.05, 0.15, 0.15);
			scaleBtn = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({color:'#cccccc', map: texture}));	
			scaleBtn.scale.set(1, 1 , 1);
			scaleBtn.position.set(0.02,-0.06,-0.1);
			surface.add(scaleBtn);	
			
			scaleBtn.addEventListener('cursorup', function (event) 
			{
				openTab(null, 'scaleTab');
				
				activeEditType = 'scale';
				
				updateNativeObject(textArray[0], 'n-text', { text: 'Scaling', fontSize: 1 });
			});
		});

		var deleteBtn;
		url = 'http://playground-editor.s3-us-west-2.amazonaws.com/assets/images/delete_map.png';	
		loader.load(url, function ( texture ) 
		{
			geometry = new THREE.BoxGeometry(0.05, 0.15, 0.15);
			deleteBtn = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({color:'#FF0000', map: texture}));	
			deleteBtn.scale.set(1, 1, 1);
			deleteBtn.position.set(0.02,-0.06,-0.4);
			surface.add(deleteBtn);

			deleteBtn.addEventListener('cursordown', function (event) 
			{
				stopEditing(selectedObject);
				currentObjectRef.set(null);
				
				/*
				var val = 0;
				var baseName = selectedObject.name.substr(0, selectedObject.name.indexOf('_')); 
				baseRef.child('loaded').child(baseName).once('value', function (data) 
				{ 
					val = data.val();
				});
				
				baseRef.child('loaded').child(baseName).set(val-1);
				*/
				selectedObject = null;
			});			
		});

		lockBtn.addEventListener('cursorup', function (event) 
		{
			toggleUILock();
		});
		
		stayBtn.addEventListener('cursorup', function (event) 
		{
			toggleSurfacePos();
		});
		
		hideBtn.addEventListener('cursorup', function (event) 
		{	
			if (!isHidden)
			{
				if (isLocked)
				{
					toggleUILock();
				}
				
				isHidden = true;
				updateSurfacePos = false;
				surface.position.set(0, -2000, 0);
				openBtn.position.set(0,-1,0.5);
			}
		});
		
		openBtn.addEventListener('cursorup', function (event) 
		{	
			if (isHidden)
			{
				isHidden = false;
				updateSurfacePos = true;
				
				openBtn.position.set(0,-5000,5);
			}
		});
	
		surface.add(doc);
		doc.rotateY(90 * Math.PI / 180);
		surface.rotateZ(45 * Math.PI / 180);
		doc.position.set(0, 0.4, 0);
		doc.scale.set(0.008, 0.008, 0.1);
		
		doc.inputEnabled = true;
		
		document.body.style.display = 'block';
		UltimateLoader.load('http://playground-editor.s3-us-west-2.amazonaws.com/assets/obj/arrow4.obj', function(object)
		{
			var arrowGroup = new THREE.Group;
			arrowGroup.position.set(0,-0.5,0);
			arrowGroup.scale.set(0.1, 0.1, 0.1);
			arrowGroup.rotateY(90 * Math.PI / 180);
			
			var arrow = object;
			
			//left
			var arrow1 = arrow.clone();
			arrow1.children[0].material = new THREE.MeshBasicMaterial( {color: 'blue'} );
			arrow1.rotateZ(180 * Math.PI / 180);
			arrow1.position.set(-2, 0, 0);
			arrowGroup.add(arrow1);
				
			//right
			var arrow2 = arrow.clone();
			arrow2.children[0].material = new THREE.MeshBasicMaterial( {color: 'blue'} );
			arrow2.position.set(2, 0, 0);
			arrowGroup.add(arrow2);
			
			//up
			var arrow3 = arrow.clone();
			arrow3.children[0].material = new THREE.MeshBasicMaterial( {color: 'red'} );
			arrow3.rotateZ(90 * Math.PI / 180);
			arrow3.position.set(0, 2, 0);
			arrowGroup.add(arrow3);
			
			//down
			var arrow4 = arrow.clone();
			arrow4.children[0].material = new THREE.MeshBasicMaterial( {color: 'red'} );
			arrow4.rotateZ(-90 * Math.PI / 180);
			arrow4.position.set(0, -2, 0);
			arrowGroup.add(arrow4);
			
			//down-left
			var arrow5 = arrow.clone();
			arrow5.children[0].material = new THREE.MeshBasicMaterial( {color: 'green'} );
			arrow5.rotateZ(-135 * Math.PI / 180);
			arrow5.position.set(-2, -2, 0);
			arrowGroup.add(arrow5);
			
			//up-right
			var arrow6 = arrow.clone();
			arrow6.children[0].material = new THREE.MeshBasicMaterial( {color: 'green'} );
			arrow6.rotateZ(45 * Math.PI / 180);
			arrow6.position.set(2, 2, 0);
			arrowGroup.add(arrow6);
			
			surface.add(arrowGroup);
			
			var data;
		
			data = { text: '+x', fontSize: 5};
			var xText = addNativeText(data);
			xText.position.set(-0.1, 0, 0.31);
			arrow2.add(xText);

			data = { text: '+y', fontSize: 5 };
			var yText = addNativeText(data);
			yText.position.set(-0.1, 0, 0.31);
			yText.rotateZ(-90 * Math.PI / 180);
			arrow3.add(yText);

			data = { text: '+z', fontSize: 5 };
			var zText = addNativeText(data);
			zText.position.set(0, 0, 0.31);
			zText.rotateZ(-45 * Math.PI / 180);
			arrow6.add(zText);
			
			data = { text: '-x', fontSize: 5};
			var xnText = addNativeText(data);
			xnText.position.set(-0.1, 0, 0.31);
			xnText.rotateZ(-180 * Math.PI / 180);
			arrow1.add(xnText);

			data = { text: '-y', fontSize: 5 };
			var ynText = addNativeText(data);
			ynText.position.set(-0.1, 0, 0.31);
			ynText.rotateZ(90 * Math.PI / 180);
			arrow4.add(ynText);

			data = { text: '-z', fontSize: 5 };
			var znText = addNativeText(data);
			znText.position.set(0, 0, 0.31);
			znText.rotateZ(135 * Math.PI / 180);
			arrow5.add(znText);
			
			//left
			arrow1.addEventListener('cursordown', function (event) { pressingArrow = arrowAxisConfig[activeEditType].arrow1; arrowPress();});
			arrow1.addEventListener('cursorup', function (event) { pressingArrow = false; arrowHoldCount = 0;});
		
			//right
			arrow2.addEventListener('cursordown', function (event) { pressingArrow = arrowAxisConfig[activeEditType].arrow2; arrowPress();});
			arrow2.addEventListener('cursorup', function (event) { pressingArrow = false; arrowHoldCount = 0;});
			
			//up
			arrow3.addEventListener('cursordown', function (event) { pressingArrow = arrowAxisConfig[activeEditType].arrow3; arrowPress();});
			arrow3.addEventListener('cursorup', function (event) { pressingArrow = false; arrowHoldCount = 0;});
			
			//down
			arrow4.addEventListener('cursordown', function (event) { pressingArrow = arrowAxisConfig[activeEditType].arrow4; arrowPress();});
			arrow4.addEventListener('cursorup', function (event) { pressingArrow = false; arrowHoldCount = 0;});
			
			//up-left
			arrow5.addEventListener('cursordown', function (event) { pressingArrow = arrowAxisConfig[activeEditType].arrow5; arrowPress();});
			arrow5.addEventListener('cursorup', function (event) { pressingArrow = false; arrowHoldCount = 0;});
			
			//down-right
			arrow6.addEventListener('cursordown', function (event) { pressingArrow = arrowAxisConfig[activeEditType].arrow6; arrowPress();});
			arrow6.addEventListener('cursorup', function (event) { pressingArrow = false; arrowHoldCount = 0;});	
		});
	}
	
	function arrowPress()
	{
		if (selectedObject)
		{		
			switch (activeEditType)
			{
				case 'rotate':
					selectedObject.obj.rotation[pressingArrow.axis] += pressingArrow.distance;
					break;
					
				case 'move':
					selectedObject.obj.position[pressingArrow.axis] += pressingArrow.distance;
					break;
					
				case 'scale':
					selectedObject.obj.scale[pressingArrow.axis] += pressingArrow.distance;
					break;	
			}			
		}	
	}
	
	function toggleUILock()
	{
		if (!isLocked)
		{
			isLocked = true;
			updateSurfacePos = false;
			
			updateNativeObject(textArray[4], 'n-text', { text: 'Unlock', fontSize: 1 });
			THREE.SceneUtils.attach(surface, scene, user.hips);
		}
		else
		{
			isLocked = false;
			updateSurfacePos = true;
			
			updateNativeObject(textArray[4], 'n-text', { text: 'Lock', fontSize: 1 });
			THREE.SceneUtils.detach(surface, user.hips, scene);
		}
	}
	
	function toggleSurfacePos()
	{
		if (!updateSurfacePos)
		{
			updateSurfacePos = true;
			
			updateNativeObject(textArray[2], 'n-text', { text: 'Stay', fontSize: 1 });
		}
		else
		{
			updateSurfacePos = false;
			
			updateNativeObject(textArray[2], 'n-text', { text: 'Move', fontSize: 1 });	
		}
	}
				
	/**
	 * Initalizes the main Firebase events
	 *
	 */
	function initFirebaseFunctions()
	{
		//Check if we need to create settings in Firebase, otherwise grab and set variables	
		settingsRef.once("value", function(data) 
		{
			if (!data.val())
			{
				userRef.update({editMode: 1});		
			}
			else
			{
				editMode = data.val().editMode;
			}
		});
		
		//Check if we need to create user settings in Firebase
		userRef.once("value", function(data) 
		{ 
			if (!data.val())
			{
				userRef.set({isUserCurrentlyEditing: 0, selectedObject: "", preventRotate: false, rotationSnap: 360});		
			}
		});
			
		//child_added will grab all 'object' nodes when app loads and will then detect
		//when a new 'object' node is added to Firebase
		//
		//We rely on this so the PlaygroundEditorWeb can communicate here since PlaygroundEditorWeb is responsible for
		//'creating' new objects via the tools menu: PlaygroundEditorWeb ---new object---> Firebase ---new data---> PlaygroundEditor
		objectsRef.on('child_added', function (childSnapshot, prevChildkey) 
		{
			addChild(objectsRef, childSnapshot);
			addChildWeb(objectsRef, childSnapshot);
		});
		
		function addChild(ref, childSnapshot)
		{
			var objectName = childSnapshot.key();
		
			var objectsBaseRef = childSnapshot.val().baseRef;
			var objectsRef = childSnapshot.val().objRef;
			var objectExtension = childSnapshot.val().extension;
			var objectScale = childSnapshot.val().scale;
			var objectPos = childSnapshot.val().pos;
			var objectRot = childSnapshot.val().rot;
			var objectLock = childSnapshot.val().settings.locked;

			var objectStatus = childSnapshot.val().objStatus;
					
			loadNative(objectsRef, objectName, objectPos, objectRot, objectScale, objectStatus, objectLock);	
			
			//When the object position changes in Firebase, grab new position
			ref.child(objectName).child("pos").on('value', function (data) 
			{
				if (data.val() == null) return;
				
				var pos = data.val(); 
			
				//Will update for everyone else, isEditing is local (otherwise, things go crazy)
				//Also, if object3d doesn't exist, don't do anything
				if (!isLocalEdit(objectName) && objects[objectName])
				{		
					objects[objectName].obj.position.set(pos.x, pos.y, pos.z);
				}
			});
			
			//When the object rotation changes in Firebase, grab new rotation
			ref.child(objectName).child("rot").on('value', function (data) 
			{
				if (data.val() == null) return;
				
				var rot = data.val();
			
				//Will update for everyone else, isEditing is local (otherwise, things go crazy)
				//Also, if object3d doesn't exist, don't do anything
				if (!isLocalEdit(objectName) && objects[objectName])
				{		
					objects[objectName].obj.quaternion.set(rot.x, rot.y, rot.z, rot.w);
				}
			});
			
			//When the object scale changes in Firebase, grab new scale
			ref.child(objectName).child("scale").on('value', function(data) 
			{ 
				if (data.val() == null) return;
				
				var scale = data.val();
				
				if (!isLocalEdit(objectName) && objects[objectName])
				{
					objects[objectName].obj.scale.set(masterScale * scale.x, masterScale * scale.y, masterScale * scale.z);
				}
			});
			
			ref.child(objectName).child("settings").child("currentlyBeingEdited").on('value', function(data) 
			{
				if (data.val() == null) return;
				
				if (!isLocalEdit(objectName) && objects[objectName])
				{
					objects[objectName].settings.currentlyBeingEdited = data.val();
				}
			});
			
			ref.child(objectName).child("settings").child("locked").on('value', function(data) 
			{
				if (data.val() == null) return;
				
				if (!isLocalEdit(objectName) && objects[objectName])
				{
					objects[objectName].settings.locked = data.val();

					if (data.val() == true)
					{
						if (user.isModerator || globalEdit)
						{
							document.getElementById("lock-object-toggle").innerHTML= "Unlock";
						}
					}
					else
					{
						if (user.isModerator || globalEdit)
						{
							document.getElementById("lock-object-toggle").innerHTML= "Lock";
						}
					}
				}
			});
			
			ref.child(objectName).on('child_removed', function(oldChildSnapshot) 
			{
				if (objects[objectName])
				{
					scene.remove(objects[objectName].obj);
					viewerSelect.remove(objects[objectName].option.index);
					delete objects[objectName];
				}
			});
		}
		
		function addChildWeb(ref, childSnapshot)
		{
			var objectName = childSnapshot.key();

			loadedObjects[objectName] = 
			{ 
				name: objectName,
				pos: {x: 0, y: 0, z: 0},
				scale: 1,
				settings: { currentlyEditing: false  }
			};
			
			ref.child("pos").on('value', function (childSnapshot, prevChildkey) 
			{
				var pos = childSnapshot.val();
				
				if (isLocalEdit(objectName) && objects[objectName])
				{
					loadedObjects[objectName].pos = pos;
					document.getElementById("posx").value = pos.x;
					document.getElementById("posy").value = pos.y;
					document.getElementById("posz").value = pos.z;
				}
			});

			ref.child("scale").on('value', function (childSnapshot, prevChildkey) 
			{
				var scale = childSnapshot.val();
				
				if (isLocalEdit(objectName) && objects[objectName])
				{
					loadedObjects[objectName].scale = scale;
					document.getElementById("scalex").value = scale.x;
					document.getElementById("scaley").value = scale.y;
					document.getElementById("scalez").value = scale.z;
				}
			});
		}
				
		userRef.child("editMode").on("value", function(data) 
		{ 
			editMode = data.val();
		});
		
		userRef.child("rotationSnap").on("value", function(data) 
		{ 
			if(data.val()) rotationSnap = data.val();
		});
	
	}
	
	/**
	 * Update editing variabels and start editing the object
	 * 
	 *
	 */
	function startEditing(object)
	{
		for (var o in objects)
		{
			if (objects[o] != object)
			{
				objects[o].obj.traverse(function(child) 
				{
					if (child instanceof THREE.Mesh) 
					{
						child.userData.altspace = {collider: {enabled: false}};
					}
				});
			}
		}
			
		var theObject = object.obj;

		headVector.setFromMatrixPosition(user.head.matrixWorld);
		objectVector.setFromMatrixPosition(theObject.matrixWorld);
		staticDistance = headVector.distanceTo(objectVector);
		
		object.settings.currentlyBeingEdited = true;
		selectedObject = object;
		isUserCurrentlyEditing = true;
		
		currentObjectRef = objectsRef.child(object.name);

		currentObjectRef.child("settings").update({currentlyBeingEdited: true});
		userRef.child('isUserCurrentlyEditing').set(true);
		userRef.child("selectedObject").set(object.name);
		
		document.getElementById("object").innerHTML = "Object Selected: " + object.name;

		currentObjectRef.child("pos").once('value', function (data) 
		{
			var pos = data.val();
			
			document.getElementById("posx").value = pos.x;
			document.getElementById("posy").value = pos.y;
			document.getElementById("posz").value = pos.z;
		});
		
		document.getElementById("rotx").value = 1;
		document.getElementById("roty").value = 1;
		document.getElementById("rotz").value = 1;

		currentObjectRef.child("scale").once('value', function (data) 
		{
			var scale = data.val();
			
			document.getElementById("scalex").value = scale.x;
			document.getElementById("scaley").value = scale.y;
			document.getElementById("scalez").value = scale.z;
		});
	}
	
	/**
	 * Update editing variabels and stop editing the object
	 * 
	 *
	 */
	function stopEditing(object)
	{
		var theObject = object.obj;

		object.settings.currentlyBeingEdited = false;	
		isUserCurrentlyEditing = false;
		
		userRef.child('isUserCurrentlyEditing').set(false);
		currentObjectRef.child("settings").update({currentlyBeingEdited: false});
		
		prevRotX = 0;
		prevRotY = 0;
		prevRotZ = 0;
		prev = 0;
	
		
		for (var o in objects)
		{
			objects[o].obj.traverse(function(child) 
			{
				if (child instanceof THREE.Mesh && !objects[o].settings.locked) 
				{
					child.userData.altspace = {collider: {enabled: true}};
				}
			});
		}
	}
	
	/**
	 * Load the native object with transform information.
	 * 
	 *
	 */
	function loadNative(path, name, pos, rot, scale, objectStatus, objectLock)
	{		
		var mesh = addNativeObject('n-object');
		updateNativeObject(mesh, 'n-object', {res: path})
		
		mesh.position.set(pos.x, pos.y, pos.z);

		mesh.scale.set(masterScale * scale.x, masterScale * scale.y, masterScale * scale.z);
		mesh.quaternion.set(rot.x, rot.y, rot.z, rot.w);
			
		mesh.userData.altspace = {collider: {enabled: true}};
		mesh.traverse(function (obj) {
			if (obj instanceof THREE.Mesh) {
				obj.userData.altspace = {collider: {enabled: true}};
			}
		})
		
		var data = 
		{
			text: name,
			fontSize: 5
		}
		
		var text = addNativeText(data);
		
		text.visible = false;
		
		mesh.add(text);
			
		var s = name.split('-');
		name.length - 1;
		
		var dimensions = {w: 0, h: 1, l: 0};
		
		for (var i = 0; i < s.length-1; i++)
		{
			var regex = /\d/g;
			if (regex.test(s[i]))
			{
				switch (s[i][1])
				{
					case 'r':
						dimensions.w = parseInt(s[i][0]);
						dimensions.l = parseInt(s[i][0]);
						break;
						
					case 'd':
						dimensions.w = parseInt(s[i][0]);
						dimensions.h = parseInt(s[i][0]);
						break;
						
					case 'w':
						dimensions.w = parseInt(s[i][0]);
						break;
						
					case 'h':
						dimensions.h = parseInt(s[i][0]);
						break;

					case 'l':
						dimensions.l = parseInt(s[i][0]);
						break;							
				}	
			}
		}
		
		//Not everything is the same....
		switch (s[0])
		{
			case 'pipe':
				var l = dimensions.l;
				dimensions.l = (dimensions.w);
				dimensions.w = -(l);
				break;
			
			//This is here because some assets (curves) are weird.
			default:
				dimensions.l = -(dimensions.l);
				break;
		}
	
		text.position.set((dimensions.l / 2), (dimensions.h + 1), (dimensions.w / 2));
		
		altspace.addNativeComponent(text, 'n-billboard');
					
		setupObject(name, mesh, objectLock, text);
	}
	
	function addNativeText(theData)
	{
		var mesh = addNativeObject('n-text');
		updateNativeObject(mesh, 'n-text', theData);
		
		return mesh;
	}
	
	function addNativeObject(type)
	{
		var placeholderGeometry = new THREE.BoxGeometry(0.001, 0.001, 0.001);
		var placeholderMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 });
		placeholderMaterial.visible = false;
		
		var mesh = new THREE.Mesh(placeholderGeometry, placeholderMaterial);	
		
		scene.add(mesh);
		
		altspace.addNativeComponent(mesh, type);

		return mesh;
	}
	
	function updateNativeObject(mesh, type, data)
	{
		var theSchema = schema['n-text'];
		for (var s in data)
		{
			theSchema[s] = data[s];
		}
		
		altspace.updateNativeComponent(mesh, type, theSchema);
	}
	
	/**
	 * Add object to master array and add events
	 * 
	 *
	 */
	function setupObject(theObjectName, theObject, objectLock, theText)
	{
		objects[theObjectName] = 
		{ 
			name: theObjectName,
			obj: theObject,
			boundingBox: getBoundingBox(theObject),
			settings: { currentlyBeingEdited: false, locked: objectLock },
			text: theText
		};
		
		theObject.traverse(function(child) 
		{
			if (child instanceof THREE.Mesh) 
			{
				if (objectLock)
				{
					child.userData.altspace = {collider: {enabled: false}};
				}
				else
				{
					child.userData.altspace = {collider: {enabled: true}};
				}
			}
		});
			
		var ref = objectsRef;		
		
		ref.child(theObjectName).update({objStatus: 'old'});
			
		if (user.isModerator || globalEdit)
		{
			addEvents(objects[theObjectName]);
		
			var option = viewerSelect.appendChild(document.createElement('option'));
			var optionID = document.createAttribute("id");
			optionID.value = theObjectName;   
			option.setAttributeNode(optionID);
			
			option.innerHTML = theObjectName;
			option.value = theObjectName;
		
			objects[theObjectName].option = option;
		}	
		
		var objSize = objects[theObjectName].boundingBox.size();

		if (objSize.x > 2000 && objSize.x < 10000)
		{
			theObject.scale.set(0.01, 0.01, 0.01);
			objects[theObjectName].scale = 0.01;
			ref.child(theObjectName).child("scale").set({x: 0.1, y: 0.1, z: 0.1});
			ref.child(theObjectName).child("scaleRatio").set(0.1);
		
		}
		else if (objSize.x > 10000)
		{
			theObject.scale.set(0.001, 0.001, 0.001);
			objects[theObjectName].scale = 0.001;
			ref.child(theObjectName).child("scale").set({x: 0.001, y: 0.001, z: 0.001});
			ref.child(theObjectName).child("scaleRatio").set(0.001);
		}
		else
		{
			ref.child(theObjectName).child("scaleRatio").once('value', function (data)
			{
				if (!data.val())
				{
					objects[theObjectName].scale = 1;
				}
				else
				{
					objects[theObjectName].scale = data.val();	
				}			
			});
		}
	}

	
	/**
	 * Add curserdown events to an object
	 * This will attach or detach the object to the users head
	 *
	 */
	function addEvents(object)
	{
		var theObject = object.obj;
		
		theObject.addEventListener('cursorup', function(event) 
		{
			if (editMode)
			{		
				if (!isUserCurrentlyEditing)
				{
					if (!object.settings.currentlyBeingEdited && !object.settings.locked)
					{
						startEditing(object);
					}		
				}	
				else if (isUserCurrentlyEditing && selectedObject.obj == theObject)
				{
					stopEditing(object);
				}
			}
		});
		
		theObject.addEventListener('cursorenter', function (event) 
		{
			
			if (!isUserCurrentlyEditing && !object.settings.currentlyBeingEdited && !object.settings.locked && editMode == true)
			{
				if (object.text)
					object.text.visible = true;
				
				theObject.traverse(function(child) 
				{
					if (child instanceof THREE.Mesh) 
					{
						child.material.color = hoverColorOn;
					}
				});
			}	
		});
		
		theObject.addEventListener('cursorleave', function (event) 
		{
			
			if (!isUserCurrentlyEditing && !object.settings.currentlyBeingEdited && !object.settings.locked && editMode == true)
			{
				if (object.text)
					object.text.visible = false;
				
				theObject.traverse(function(child) 
				{
					if (child instanceof THREE.Mesh) 
					{
						child.material.color = hoverColorOff;
					}
				});
			}
		});
	}
	
	/**
	 * Rotate object based on axis and data.
	 * Set the rotation in Firebase.
	 *
	 */
	function rotate(objectName, axis, data)
	{
		
		// (data.x - prevRotX) will either be 1 or -1 (but sometimes greater than 1, TODO: fix)
		// rotationSnap is the angle at which to move the object
		// Converting to rads
		// example: (-1 * 90) = -90
		
		if ( axis === "x" ) 
		{
			var x = ((data - prevRotX) * (rotationSnap)) * Math.PI / 180;	
			objects[objectName].obj.rotateX(x);
			prevRotX = data;
		}
		else if ( axis === "y" ) 
		{
			var y = ((data - prevRotY) * (rotationSnap)) * Math.PI / 180;
			objects[objectName].obj.rotateY(y);
			prevRotY = data;
		}
		else if ( axis === "z" ) 
		{
			var z = ((data - prevRotZ) * (rotationSnap)) * Math.PI / 180;
			objects[objectName].obj.rotateZ(z);
			prevRotZ = data;
		}
		
		main.setRotation(objectName);
	}

	/**
	 * Mainly used be the text functions, this will get the center of the bounding box
	 * 
	 *
	 */
	function getCenterPoint(mesh) 
	{
		var middle = new THREE.Vector3();
		var geometry = mesh.geometry;

		geometry.computeBoundingBox();

		middle.x = (geometry.boundingBox.max.x + geometry.boundingBox.min.x) / 2;
		middle.y = (geometry.boundingBox.max.y + geometry.boundingBox.min.y) / 2;
		middle.z = (geometry.boundingBox.max.z + geometry.boundingBox.min.z) / 2;

		return middle;
	}
	
	function getBoundingBox(object)
	{	
		var box = new THREE.Box3().setFromObject( object );

		return box;
	}

	function notInitilizedException(func)
	{
		return "The method - " + func + " - could not be called because PlaygroundEditor is NOT initilized!";
	}
	
	function isLocalEdit(objectName)
	{
		if (selectedObject != null)
		{
			if (!isUserCurrentlyEditing)
			{
				return false;
			}
			else if (selectedObject.name == objectName)
			{
				return true;
			}
		}
		
		return false;
	}
	
	/********************************************************
	 * HTML document stuff
	 * 
	 *
	 */
	 
	function initFirebaseFunctionsDoc()
	{
		userRef.child('rotationSnap').set(1);
		
		userRef.child("editMode").once("value", function(data) 
		{
			editMode = data.val();
			
			if (editMode)
			{
				document.getElementById("edit-toggle").innerHTML= "ON";
			}
			else
			{
				document.getElementById("edit-toggle").innerHTML = "OFF";
			}
		});
		
		userRef.onDisconnect().update({selectedObject: ""});
	}

	main.toggleEdit = function()
	{
		if (!editMode)
		{
			editMode = true;
			userRef.update({editMode: 1 });
			document.getElementById("edit-toggle").innerHTML= "ON";
		}
		else
		{
			editMode = false;
			userRef.update({editMode: 0 });
			document.getElementById("edit-toggle").innerHTML = "OFF";
		}
	}
	
	main.toggleRotate = function()
	{
		if (!preventRotate)
		{
			preventRotate = true;
			userRef.update({preventRotate: 1 });
			document.getElementById("rotate-toggle").innerHTML= "TRUE";
		}
		else
		{
			preventRotate = false;
			userRef.update({preventRotate: 0 });
			document.getElementById("rotate-toggle").innerHTML = "FALSE";
		}
	}
	
	main.updateRotSnap = function()
	{
		var val = parseInt(document.getElementById("rotationSnap").value);
		
		if (val > 0 && val <= 360)
		{
			userRef.child('rotationSnap').set(val);
			document.getElementById("rotx").max = 360 / val;
			document.getElementById("roty").max = 360 / val;
			document.getElementById("rotz").max = 360 / val;
		}
	}
	
	main.updatePOS = function ()
	{
		var pos = {};
		
		if (selectedObject.name == "" || selectedObject == null) return;
		
		pos.x = parseFloat(document.getElementById("posx").value);
		pos.y = parseFloat(document.getElementById("posy").value);
		pos.z = parseFloat(document.getElementById("posz").value);
		
		var objectsRef = currentObjectRef.child("pos");
		objectsRef.set({x: pos.x, y: pos.y, z: pos.z});
	}
	
	main.updateROT = function(type, val, snap)
	{
		if (selectedObject.name == "" || selectedObject == null) return;
		
		rotate(selectedObject.name, type, parseFloat(val));	
	}
	
	main.updateScaleXYZ = function(val)
	{
		var scale = {};
		
		if (selectedObject.name == "" || selectedObject == null) return;

		scale.x = parseFloat(val);
		scale.y = parseFloat(val);
		scale.z = parseFloat(val);

		var objectScaleRef = currentObjectRef.child("scale");
		objectScaleRef.set({x: scale.x, y: scale.x, z: scale.z});
		
		selectedObject.obj.scale.set(masterScale * scale.x, masterScale * scale.y, masterScale * scale.z);
	}
	
	main.updateScale = function()
	{
		var scale = {};
		
		if (selectedObject.name == "" || selectedObject == null) return;
		
		scale.x = parseFloat(document.getElementById("scalex").value);
		scale.y = parseFloat(document.getElementById("scaley").value);
		scale.z = parseFloat(document.getElementById("scalez").value);
			
		if (scale.x > 0 && scale.y > 0 && scale.z > 0)
		{
			var objectScaleRef = currentObjectRef.child("scale");
			objectScaleRef.set({x: scale.x, y: scale.y, z: scale.z});
			selectedObject.obj.scale.set(masterScale * scale.x, masterScale * scale.y, masterScale * scale.z);
		}
	}
	
	main.updateSelected = function(objectName)
	{
		if (isUserCurrentlyEditing)
		{
			stopEditing(selectedObject);
		}

		selectedObject = objects[objectName];

		currentObjectRef = objectsRef.child(objects[objectName].name);
		
		document.getElementById("object").innerHTML = "Object Selected: " + objectName;
		
		if (selectedObject.settings.locked)
		{
			document.getElementById("lock-object-toggle").innerHTML= "Unlock";
			
			selectedObject.obj.traverse(function(child) 
			{
				if (child instanceof THREE.Mesh) 
				{
					child.userData.altspace = {collider: {enabled: false}};
				}
			});
		}
		else
		{
			document.getElementById("lock-object-toggle").innerHTML = "Lock";
			
			selectedObject.obj.traverse(function(child) 
			{
				if (child instanceof THREE.Mesh) 
				{
					child.userData.altspace = {collider: {enabled: true}};
				}
			});
		}
	}
	
	main.toggleLock = function()
	{
		if (!selectedObject.settings.locked)
		{
			selectedObject.settings.locked = true;
			currentObjectRef.child("settings").update({locked: true});
			document.getElementById("lock-object-toggle").innerHTML= "Unlock";
			
			selectedObject.obj.traverse(function(child) 
			{
				if (child instanceof THREE.Mesh) 
				{
					child.userData.altspace.collider.enabled = false;
				}
			});
		}
		else
		{
			selectedObject.settings.locked = false;
			currentObjectRef.child("settings").update({locked: false});
			document.getElementById("lock-object-toggle").innerHTML = "Lock";
			
			selectedObject.obj.traverse(function(child) 
			{
				if (child instanceof THREE.Mesh) 
				{
					child.userData.altspace.collider.enabled = true;
				}
			});
		}
	}
	
	function docStart()
	{
		document.getElementById('posx').onkeydown = function(e)
		{
		   if (e.keyCode == 13) { main.updatePOS(); }
		};
		document.getElementById('posy').onkeydown = function(e)
		{
		   if (e.keyCode == 13){ main.updatePOS(); }
		};
		document.getElementById('posz').onkeydown = function(e)
		{
		   if (e.keyCode == 13){ main.updatePOS(); }
		};
		document.getElementById('scalex').onkeydown = function(e)
		{
		   if (e.keyCode == 13) { main.updateScale(); }
		};
		document.getElementById('scaley').onkeydown = function(e)
		{
		   if (e.keyCode == 13){ main.updateScale(); }
		};
		document.getElementById('scalez').onkeydown = function(e)
		{
		   if (e.keyCode == 13){ main.updateScale(); }
		};
		document.getElementById('rotationSnap').onkeydown = function(e)
		{
		   if (e.keyCode == 13){ main.updateRotSnap(); }
		};
			
		initFirebaseFunctionsDoc()
	}
	
	if (window.AFRAME)
	{
		AFRAME.registerComponent('playground-editor', 
		 {
			schema: {},
			init: function () {  main.start(this.el.object3D); },
			tick: function (t) { if (isInitilized) main.update(t); }
		 });	
	}
 
})(PlaygroundEditor, altspace);

 window.onload = function() 
 {
	var html = '<div id="masterWrapper"><div id="tabWrapper"><ul class="tab"><li><button type="button" class="tablinks" onclick="openTab(event, \'viewer\')">Viewer</button></li><li><button type="button" class="tablinks active" onclick="openTab(event, \'create\')">Create</button></li><li><button type="button" class="tablinks" onclick="openTab(event, \'settings\')">App Settings</button></li><li><button type="button" class="tablinks" onclick="openTab(event, \'help\')">Help</button></li></ul><div id="object"></div></div><div id="contentWrapper"><div id="viewer" class="tabcontent"> <select onchange="PlaygroundEditor.updateSelected(this.value); return false;" id="viewer-option"></select><div id="viewer-settings-lock">Lock Object: <button type="button" class="button" id="lock-object-toggle" onclick="PlaygroundEditor.toggleLock()">Lock</button></div></div><div id="create" class="tabcontent"><div class="clear-selected">Clear Select Box: <button type="button" class="button" id="clear=select-box" onclick="PlaygroundEditor.clearSelectBox()">Clear</button></div><div class="image-list-wrapper"><div class="image-list-title">Architecture</div><ul class="image-list" type="architecture"><li id=\'ceiling-2w-2l\'><img src=\'http://d12gawsdmsi8g4.cloudfront.net/assets/images/ceiling-2w-2l.png\'/><li id=\'ceiling-4w-4l\'><img src=\'http://d12gawsdmsi8g4.cloudfront.net/assets/images/ceiling-4w-4l.png\'/><li id=\'ceiling-skylight-4w-4l\'><img src=\'http://d12gawsdmsi8g4.cloudfront.net/assets/images/ceiling-skylight-4w-4l.png\'/><li id=\'ceiling-skylight-corner-2w-2l\'><img src=\'http://d12gawsdmsi8g4.cloudfront.net/assets/images/ceiling-skylight-corner-2w-2l.png\'/><li id=\'ceiling-skylight-edge-2w\'><img src=\'http://d12gawsdmsi8g4.cloudfront.net/assets/images/ceiling-skylight-edge-2w.png\'/><li id=\'ceiling-skylight-edge-4w\'><img src=\'http://d12gawsdmsi8g4.cloudfront.net/assets/images/ceiling-skylight-edge-4w.png\'/><li id=\'ceiling-skylight-filler-4w-4l-2\'><img src=\'http://d12gawsdmsi8g4.cloudfront.net/assets/images/ceiling-skylight-filler-4w-4l-2.png\'/><li id=\'ceiling-skylight-filler-4w-4l\'><img src=\'http://d12gawsdmsi8g4.cloudfront.net/assets/images/ceiling-skylight-filler-4w-4l.png\'/><li id=\'ceiling-slice-concave-2r\'><img src=\'http://d12gawsdmsi8g4.cloudfront.net/assets/images/ceiling-slice-concave-2r.png\'/><li id=\'ceiling-slice-concave-4r\'><img src=\'http://d12gawsdmsi8g4.cloudfront.net/assets/images/ceiling-slice-concave-4r.png\'/><li id=\'ceiling-slice-convex-2r\'><img src=\'http://d12gawsdmsi8g4.cloudfront.net/assets/images/ceiling-slice-convex-2r.png\'/><li id=\'ceiling-slice-convex-4r\'><img src=\'http://d12gawsdmsi8g4.cloudfront.net/assets/images/ceiling-slice-convex-4r.png\'/><li id=\'door-4w-4h\'><img src=\'http://d12gawsdmsi8g4.cloudfront.net/assets/images/door-4w-4h.png\'/><li id=\'floor-2w-2l\'><img src=\'http://d12gawsdmsi8g4.cloudfront.net/assets/images/floor-2w-2l.png\'/><li id=\'floor-2w-4l\'><img src=\'http://d12gawsdmsi8g4.cloudfront.net/assets/images/floor-2w-4l.png\'/><li id=\'floor-4w-2l\'><img src=\'http://d12gawsdmsi8g4.cloudfront.net/assets/images/floor-4w-2l.png\'/><li id=\'floor-4w-4l\'><img src=\'http://d12gawsdmsi8g4.cloudfront.net/assets/images/floor-4w-4l.png\'/><li id=\'floor-slice-concave-2r\'><img src=\'http://d12gawsdmsi8g4.cloudfront.net/assets/images/floor-slice-concave-2r.png\'/><li id=\'floor-slice-concave-4r\'><img src=\'http://d12gawsdmsi8g4.cloudfront.net/assets/images/floor-slice-concave-4r.png\'/><li id=\'floor-slice-convex-2r\'><img src=\'http://d12gawsdmsi8g4.cloudfront.net/assets/images/floor-slice-convex-2r.png\'/><li id=\'floor-slice-convex-4r\'><img src=\'http://d12gawsdmsi8g4.cloudfront.net/assets/images/floor-slice-convex-4r.png\'/><li id=\'railing-2l\'><img src=\'http://d12gawsdmsi8g4.cloudfront.net/assets/images/railing-2l.png\'/><li id=\'railing-4l\'><img src=\'http://d12gawsdmsi8g4.cloudfront.net/assets/images/railing-4l.png\'/><li id=\'railing-curve-concave-2r\'><img src=\'http://d12gawsdmsi8g4.cloudfront.net/assets/images/railing-curve-concave-2r.png\'/><li id=\'wall-2w-4h\'><img src=\'http://d12gawsdmsi8g4.cloudfront.net/assets/images/wall-2w-4h.png\'/><li id=\'wall-4w-4h\'><img src=\'http://d12gawsdmsi8g4.cloudfront.net/assets/images/wall-4w-4h.png\'/><li id=\'wall-base-2w\'><img src=\'http://d12gawsdmsi8g4.cloudfront.net/assets/images/wall-base-2w.png\'/><li id=\'wall-base-4w\'><img src=\'http://d12gawsdmsi8g4.cloudfront.net/assets/images/wall-base-4w.png\'/><li id=\'wall-base-curve-concave-2r\'><img src=\'http://d12gawsdmsi8g4.cloudfront.net/assets/images/wall-base-curve-concave-2r.png\'/><li id=\'wall-base-curve-concave-4r\'><img src=\'http://d12gawsdmsi8g4.cloudfront.net/assets/images/wall-base-curve-concave-4r.png\'/><li id=\'wall-base-curve-convex-2r\'><img src=\'http://d12gawsdmsi8g4.cloudfront.net/assets/images/wall-base-curve-convex-2r.png\'/><li id=\'wall-base-curve-convex-4r\'><img src=\'http://d12gawsdmsi8g4.cloudfront.net/assets/images/wall-base-curve-convex-4r.png\'/><li id=\'wall-bulkhead-2w\'><img src=\'http://d12gawsdmsi8g4.cloudfront.net/assets/images/wall-bulkhead-2w.png\'/><li id=\'wall-bulkhead-4w\'><img src=\'http://d12gawsdmsi8g4.cloudfront.net/assets/images/wall-bulkhead-4w.png\'/><li id=\'wall-bulkhead-curve-concave-2r\'><img src=\'http://d12gawsdmsi8g4.cloudfront.net/assets/images/wall-bulkhead-curve-concave-2r.png\'/><li id=\'wall-bulkhead-curve-concave-4r\'><img src=\'http://d12gawsdmsi8g4.cloudfront.net/assets/images/wall-bulkhead-curve-concave-4r.png\'/><li id=\'wall-bulkhead-curve-convex-2r\'><img src=\'http://d12gawsdmsi8g4.cloudfront.net/assets/images/wall-bulkhead-curve-convex-2r.png\'/><li id=\'wall-bulkhead-curve-convex-4r\'><img src=\'http://d12gawsdmsi8g4.cloudfront.net/assets/images/wall-bulkhead-curve-convex-4r.png\'/><li id=\'wall-curve-concave-2r-4h\'><img src=\'http://d12gawsdmsi8g4.cloudfront.net/assets/images/wall-curve-concave-2r-4h.png\'/><li id=\'wall-curve-concave-4r-4h\'><img src=\'http://d12gawsdmsi8g4.cloudfront.net/assets/images/wall-curve-concave-4r-4h.png\'/><li id=\'wall-curve-convex-2r-4h\'><img src=\'http://d12gawsdmsi8g4.cloudfront.net/assets/images/wall-curve-convex-2r-4h.png\'/><li id=\'wall-curve-convex-4r-4h\'><img src=\'http://d12gawsdmsi8g4.cloudfront.net/assets/images/wall-curve-convex-4r-4h.png\'/><li id=\'wall-curve-window-concave-4r-4h\'><img src=\'http://d12gawsdmsi8g4.cloudfront.net/assets/images/wall-curve-window-concave-4r-4h.png\'/><li id=\'wall-curve-window-concave-filler-4r-4h\'><img src=\'http://d12gawsdmsi8g4.cloudfront.net/assets/images/wall-curve-window-concave-filler-4r-4h.png\'/><li id=\'wall-curve-window-gap-concave-4r-4h\'><img src=\'http://d12gawsdmsi8g4.cloudfront.net/assets/images/wall-curve-window-gap-concave-4r-4h.png\'/><li id=\'wall-curve-window-gap-end-l-concave-4r-4h\'><img src=\'http://d12gawsdmsi8g4.cloudfront.net/assets/images/wall-curve-window-gap-end-l-concave-4r-4h.png\'/><li id=\'wall-curve-window-gap-end-r-concave-4r-4h\'><img src=\'http://d12gawsdmsi8g4.cloudfront.net/assets/images/wall-curve-window-gap-end-r-concave-4r-4h.png\'/><li id=\'wall-filler-corner-inner-4h\'><img src=\'http://d12gawsdmsi8g4.cloudfront.net/assets/images/wall-filler-corner-inner-4h.png\'/><li id=\'wall-filler-corner-outer-4h\'><img src=\'http://d12gawsdmsi8g4.cloudfront.net/assets/images/wall-filler-corner-outer-4h.png\'/><li id=\'wall-window-4w-4h\'><img src=\'http://d12gawsdmsi8g4.cloudfront.net/assets/images/wall-window-4w-4h.png\'/><li id=\'wall-window-filler-2\'><img src=\'http://d12gawsdmsi8g4.cloudfront.net/assets/images/wall-window-filler-2.png\'/><li id=\'wall-window-gap-2w-4h\'><img src=\'http://d12gawsdmsi8g4.cloudfront.net/assets/images/wall-window-gap-2w-4h.png\'/><li id=\'wall-window-gap-4w-4h\'><img src=\'http://d12gawsdmsi8g4.cloudfront.net/assets/images/wall-window-gap-4w-4h.png\'/><li id=\'wall-window-gap-end-l-2w-4h\'><img src=\'http://d12gawsdmsi8g4.cloudfront.net/assets/images/wall-window-gap-end-l-2w-4h.png\'/><li id=\'wall-window-gap-end-l-4w-4h\'><img src=\'http://d12gawsdmsi8g4.cloudfront.net/assets/images/wall-window-gap-end-l-4w-4h.png\'/><li id=\'wall-window-gap-end-r-2w-4h\'><img src=\'http://d12gawsdmsi8g4.cloudfront.net/assets/images/wall-window-gap-end-r-2w-4h.png\'/><li id=\'wall-window-gap-end-r-4w-4h\'><img src=\'http://d12gawsdmsi8g4.cloudfront.net/assets/images/wall-window-gap-end-r-4w-4h.png\'/></ul></div><div class="image-list-wrapper"><div class="image-list-title">Pipes</div><ul class="image-list" type="pipes"><li id=\'pipe-full-cap-1d\'><img src=\'http://d12gawsdmsi8g4.cloudfront.net/assets/images/pipe-full-cap-1d.png\'/><li id=\'pipe-full-cross-1d\'><img src=\'http://d12gawsdmsi8g4.cloudfront.net/assets/images/pipe-full-cross-1d.png\'/><li id=\'pipe-full-elbow-1d\'><img src=\'http://d12gawsdmsi8g4.cloudfront.net/assets/images/pipe-full-elbow-1d.png\'/><li id=\'pipe-full-fork-1d\'><img src=\'http://d12gawsdmsi8g4.cloudfront.net/assets/images/pipe-full-fork-1d.png\'/><li id=\'pipe-full-straight-1d-1l\'><img src=\'http://d12gawsdmsi8g4.cloudfront.net/assets/images/pipe-full-straight-1d-1l.png\'/><li id=\'pipe-full-straight-1d-2l\'><img src=\'http://d12gawsdmsi8g4.cloudfront.net/assets/images/pipe-full-straight-1d-2l.png\'/><li id=\'pipe-full-straight-1d-4l\'><img src=\'http://d12gawsdmsi8g4.cloudfront.net/assets/images/pipe-full-straight-1d-4l.png\'/><li id=\'pipe-full-tee-1d\'><img src=\'http://d12gawsdmsi8g4.cloudfront.net/assets/images/pipe-full-tee-1d.png\'/><li id=\'pipe-half-cap-1d\'><img src=\'http://d12gawsdmsi8g4.cloudfront.net/assets/images/pipe-half-cap-1d.png\'/><li id=\'pipe-half-cross-1d\'><img src=\'http://d12gawsdmsi8g4.cloudfront.net/assets/images/pipe-half-cross-1d.png\'/><li id=\'pipe-half-elbow-1d\'><img src=\'http://d12gawsdmsi8g4.cloudfront.net/assets/images/pipe-half-elbow-1d.png\'/><li id=\'pipe-half-fork-1d\'><img src=\'http://d12gawsdmsi8g4.cloudfront.net/assets/images/pipe-half-fork-1d.png\'/><li id=\'pipe-half-straight-1d-1l\'><img src=\'http://d12gawsdmsi8g4.cloudfront.net/assets/images/pipe-half-straight-1d-1l.png\'/><li id=\'pipe-half-straight-1d-2l\'><img src=\'http://d12gawsdmsi8g4.cloudfront.net/assets/images/pipe-half-straight-1d-2l.png\'/><li id=\'pipe-half-straight-1d-4l\'><img src=\'http://d12gawsdmsi8g4.cloudfront.net/assets/images/pipe-half-straight-1d-4l.png\'/><li id=\'pipe-half-tee-1d\'><img src=\'http://d12gawsdmsi8g4.cloudfront.net/assets/images/pipe-half-tee-1d.png\'/></ul></div><div class="image-list-wrapper"><div class="image-list-title">Objects</div><ul class="image-list" type="objects"><li id=\'basketball-hoop\'><img src=\'http://d12gawsdmsi8g4.cloudfront.net/assets/images/basketball-hoop.png\'/><li id=\'coin\'><img src=\'http://d12gawsdmsi8g4.cloudfront.net/assets/images/coin.png\'/><li id=\'cup\'><img src=\'http://d12gawsdmsi8g4.cloudfront.net/assets/images/cup.png\'/><li id=\'gem\'><img src=\'http://d12gawsdmsi8g4.cloudfront.net/assets/images/gem.png\'/><li id=\'hoop\'><img src=\'http://d12gawsdmsi8g4.cloudfront.net/assets/images/hoop.png\'/><li id=\'ring\'><img src=\'http://d12gawsdmsi8g4.cloudfront.net/assets/images/ring.png\'/><li id=\'target-archery\'><img src=\'http://d12gawsdmsi8g4.cloudfront.net/assets/images/target-archery.png\'/></ul></div><div class="image-list-wrapper"><div class="image-list-title">Effects</div><ul class="image-list" type="effects"><li id=\'fire\'><img src=\'http://d12gawsdmsi8g4.cloudfront.net/assets/images/fire.png\'/><li id=\'fireworks\'><img src=\'http://d12gawsdmsi8g4.cloudfront.net/assets/images/fireworks.png\'/><li id=\'smoke\'><img src=\'http://d12gawsdmsi8g4.cloudfront.net/assets/images/smoke.png\'/><li id=\'sparkler\'><img src=\'http://d12gawsdmsi8g4.cloudfront.net/assets/images/sparkler.png\'/><li id=\'steam\'><img src=\'http://d12gawsdmsi8g4.cloudfront.net/assets/images/steam.png\'/></ul></div></div><div id="settings" class="tabcontent"><div id="general-settings"> <div id="settings-edit">Edit Mode: <button type="button" class="button" id="edit-toggle" onclick="PlaygroundEditor.toggleEdit()">Toggle</button></div><div id="settings-rotationSnap">Rotation Snap (degrees): <input type="text" id="rotationSnap" name="rotationSnap" value="1"></div></div></div><div id="help" class="tabcontent"><div class="help-wrapper"><div class="help-title">PLAYGROUND EDITOR</div><p> <span>How to move an object: </span><br></option>It\'s easy! Click on the object you want to move. When you move your head, the object will follow. When you\'re done moving the object, click it again.</p><p> <span>Creating an Object: </span><br></option>In the <i>Create</i> tab, select the model you wish to spawn. The object will appear in front of you. To place it, click the object.</p><p> <span>Transform: </span><br></option>Click the buttons in the grat part of the the panel. You can manually enter values into the text fields - hitting enter will submit your changes. Moving the sliders will change the value automatically. Just slide it until you like your changes!</p><p> <span>Settings: </span><br></option>When <i>Edit Mode</i> is set to <b>FALSE</b>, you will not be able to move objects. This is good for when you just want to explore. When <i>Rotate On Placement</i> is set to <b>TRUE</b>, the object you are moving will snap to it\'s default rotation when you stop moving it. You can also change the rotation snap to a specified degree. For instance, if you type in 90, the object will rotate 90 degrees. All settings are LOCAL TO YOU ONLY.</p></div></div><div id="positionTab" class="tabcontent transformTabs"><div id="pos">Position <br></option><form onsubmit="PlaygroundEditor.updatePOS(); return false;">X: <input type="text" id="posx" name="posX" value=""><br></option>Y: <input type="text" id="posy"name="posY" value=""><br></option>Z: <input type="text" id="posz" name="posZ" value=""><br></option></form></div></div><div id="rotationTab" class="tabcontent transformTabs"><div id="rot">Rotation <br></option>X: <input type="range" id="rotx" name="rotX" min="1" max="360" step="1" value="1" oninput="PlaygroundEditor.updateROT(\'x\', this.value, this.max)"><br>Y: <input type="range" id="roty" name="rotY" min="1" max="360" step="1" value="1" oninput="PlaygroundEditor.updateROT(\'y\', this.value, this.max)"><br>Z: <input type="range" id="rotz" name="rotZ" min="1" max="360" step="1" value="1" oninput="PlaygroundEditor.updateROT(\'z\', this.value, this.max)"><br></div></div><div id="scaleTab" class="tabcontent transformTabs"><div id="scale">Scale <br></option>XYZ: <input type="range" id="scaleXYZ" name="scaleXYZ" min="1" max="100" step="1" value="1" oninput="PlaygroundEditor.updateScaleXYZ(this.value)"><br><form onsubmit="PlaygroundEditor.updateScale(); return false;">X: <input type="text" id="scalex" name="scaleX" value=""><br></option>Y: <input type="text" id="scaley" name="scaleY" value=""><br></option>Z: <input type="text" id="scalez" name="scaleZ" value=""><br></option></form></div></div></div></div>';
	document.body.insertAdjacentHTML( 'afterbegin', html );
	
	var css = '<style type="text/css">body,html,video{margin:0;padding:0;width:100%;height:100%;overflow:hidden}body{display:none;background-color:#fff}.clear-selected{font-size:32px;margin-left:30px}.image-list-wrapper{width:22%s;float:left;margin-left:30px;margin-top:25px}.image-list-title{font-size:32px;text-align:center}.image-list img{width:200px}.image-list{margin:0;padding:0;white-space:nowrap;width:100%;height:350px;overflow-y:scroll;overflow-x:hidden;background-color:#ddd}#general-settings,#my-objects-list,#new-object,#object-settings{min-width:300px;padding:10px;background:#fff}.image-list ul li{display:inline}#contentWrapper{overflow: hidden;margin-top:20px;width:100%}#viewer{font-size:28px;padding:10px}#new-object input,#new-object select,#viewer select{font-size:24px;min-height:20px}.viewer-object{margin-top:30px}#alert{color:red;font-style:italic}#new-object{min-height:20px;margin-bottom:50px}#general-settings{min-height:20px;margin-bottom:50px;font-size:28px}#my-objects-list{font-size:28px;min-height:20px;margin-bottom:50px}.button{height:40px;font-size:28px}#object-settings{min-height:20px}#object{float:right;font-size:28px}.transformTabs{margin:50px auto auto;text-align:center}#pos input,#rot input,#scale input{margin-top:20px;min-height:50px;min-width:500px;font-size:32px}#pos,#rot,#scale{font-size:32px}ul.tab{list-style-type:none;margin:0;padding:0;overflow:hidden;background-color:#f1f1f1}ul.tab li{float:left}ul.tab li button{display:inline-block;color:#000;text-align:center;padding:14px 16px;text-decoration:none;transition:.3s;font-size:17px}ul.tab li a:hover{background-color:#ddd}.active,ul.tab li a:focus{background-color:#ccc}.tabcontent{display:none;width:100%}</style>';
	document.head.insertAdjacentHTML( 'beforeEnd', css );
	
	document.getElementById('create').style.display = "block";
	
	var ul = document.getElementsByClassName('image-list'); // Parent

	for (var i = 0; i < ul.length; i++)
	{
		ul[i].addEventListener('click', function (e) 
		{
			var target = e.target.parentNode; // Clicked element

			PlaygroundEditor.selectNative(target.id, target.parentNode.getAttribute('type'));
		});
	}
 }

function openTab(event, tab) 
{
	var i, tabcontent, tablinks;

	tabcontent = document.getElementsByClassName("tabcontent");
	for (i = 0; i < tabcontent.length; i++) 
	{
		tabcontent[i].style.display = "none";
	}

	tablinks = document.getElementsByClassName("tablinks");
	for (i = 0; i < tablinks.length; i++) 
	{
		tablinks[i].className = tablinks[i].className.replace(" active", "");
	}

	document.getElementById(tab).style.display = "block";

	if (event != null)
	{		
		event.currentTarget.className += " active";
	}
}